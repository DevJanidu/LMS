"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { featureRequest } from "@/lib/goals/client";
import {
  isActiveGeneration,
  type GenerationView,
} from "@/lib/aven/generation-state";
import type { ActivityCategory } from "@/lib/aven/activity";
import { messageKey, messageSeq, type AvenMessageRecord } from "./types";
/** Poll delay while following: steady while healthy, backing off on errors. */
export function followDelay(failures: number) {
  return Math.min(10000, 1000 * 2 ** Math.min(failures, 4));
}
/** Whether a refresh on return is worth making (avoids a request storm on rapid tab switching). */
export function shouldRefreshOnReturn(lastRefresh: number, now: number) {
  return now - lastRefresh >= 5000;
}
/**
 * Applies a durable snapshot to the local transcript. Newer-by-sequence wins, so text this
 * tab already shows is never duplicated or rolled back, and a stale poll is a no-op.
 */
export function applySnapshot(
  messages: AvenMessageRecord[],
  generation: GenerationView,
): AvenMessageRecord[] {
  const key = `assistant:${generation.requestId}`;
  const index = messages.findIndex((message) => messageKey(message) === key);
  if (index < 0) return messages;
  const current = messages[index];
  if (current.status !== "streaming" || generation.seq <= messageSeq(current))
    return messages;
  const copy = [...messages];
  copy[index] = {
    ...current,
    content: generation.content,
    seq: generation.seq,
    components: generation.components,
  };
  return copy;
}
interface Options {
  userId: string;
  conversationId: string | null;
  generation: GenerationView | null | undefined;
  /** This tab is streaming a reply itself. */
  streaming: boolean;
  setMessages: Dispatch<SetStateAction<AvenMessageRecord[]>>;
  setGeneration: (value: GenerationView | null) => void;
  reload: (id: string) => Promise<unknown>;
}
/**
 * Keeps the view in step with the server, the source of truth for generation state:
 * - follows a reply this tab has no live stream for, using the lightweight status endpoint,
 *   paused while the page is hidden or offline (background timers are never relied on);
 * - resumes immediately on visibilitychange, pageshow (bfcache) and online;
 * - refreshes once on return when idle, so a reply finished elsewhere appears;
 * - tells other tabs of the same account when a turn starts or ends (BroadcastChannel).
 */
export function useGenerationFollow({
  userId,
  conversationId,
  generation,
  streaming,
  setMessages,
  setGeneration,
  reload,
}: Options) {
  const following =
    !streaming &&
    Boolean(conversationId) &&
    isActiveGeneration(generation?.status);
  const requestId = following ? generation!.requestId : undefined;
  const [activity, setActivity] = useState<ActivityCategory>();
  const channel = useRef<BroadcastChannel | null>(null),
    lastRefresh = useRef(0),
    latest = useRef({ conversationId, streaming, reload });
  useEffect(() => {
    latest.current = { conversationId, streaming, reload };
  });
  const refresh = useCallback((force = false) => {
    const { conversationId: id, streaming: live, reload: load } = latest.current;
    if (!id || live) return;
    if (!force && !shouldRefreshOnReturn(lastRefresh.current, Date.now())) return;
    lastRefresh.current = Date.now();
    void load(id).catch(() => {});
  }, []);
  // Same-origin tab sync; the server stays authoritative, messages only trigger a refresh.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const sync = new BroadcastChannel(`aven:${userId}`);
    channel.current = sync;
    sync.onmessage = (event: MessageEvent<{ conversationId?: string }>) => {
      if (event.data?.conversationId === latest.current.conversationId)
        refresh(true);
    };
    return () => {
      sync.close();
      channel.current = null;
    };
  }, [userId, refresh]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onReturn = () => refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onReturn);
    window.addEventListener("pageshow", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onReturn);
      window.removeEventListener("pageshow", onReturn);
    };
  }, [refresh]);
  useEffect(() => {
    if (!following || !conversationId || !requestId) {
      setActivity(undefined);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined,
      failures = 0,
      active = true,
      inFlight: AbortController | null = null;
    const tick = async () => {
      timer = undefined;
      if (!active) return;
      // Hidden or offline: wait for a resume event instead of spending requests.
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      inFlight = new AbortController();
      try {
        const value = await featureRequest<{ generation: GenerationView | null }>(
          `/api/aven/chat/status?conversationId=${conversationId}&requestId=${requestId}`,
          undefined,
          inFlight.signal,
        );
        if (!active) return;
        failures = 0;
        const next = value.generation;
        if (!next || !isActiveGeneration(next.status)) {
          // Finished (or failed) elsewhere. The refresh swaps in the final reply, cards and
          // generation state together; if it fails, following still ends so the view can
          // never stay "generating".
          lastRefresh.current = Date.now();
          await reload(conversationId).catch(() => setGeneration(next));
          return;
        }
        setActivity(next.activity ?? "working");
        setMessages((current) => applySnapshot(current, next));
      } catch {
        if (!active) return;
        failures++;
      } finally {
        inFlight = null;
      }
      if (active) timer = setTimeout(tick, followDelay(failures));
    };
    const resume = () => {
      if (!active || timer || inFlight || document.visibilityState !== "visible")
        return;
      timer = setTimeout(tick, 0);
    };
    timer = setTimeout(tick, 0);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      inFlight?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [following, conversationId, requestId, reload, setMessages, setGeneration]);
  const notify = useCallback((id: string, phase: "start" | "end") => {
    channel.current?.postMessage({ conversationId: id, phase });
  }, []);
  return {
    following,
    followedKey: requestId ? `assistant:${requestId}` : undefined,
    activity: following ? (activity ?? generation?.activity ?? "working") : undefined,
    notify,
  };
}
