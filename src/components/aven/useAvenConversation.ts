"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { featureRequest } from "@/lib/goals/client";
import type { ProposalRecord } from "./ProposalCard";
import {
  messageKey,
  messageSeq,
  type AvenMessageRecord,
  type ConversationResult,
} from "./types";
const same = (a: AvenMessageRecord, b: AvenMessageRecord) =>
  a.content === b.content &&
  a.status === b.status &&
  a.createdAt === b.createdAt &&
  JSON.stringify(a.context ?? null) === JSON.stringify(b.context ?? null);
/**
 * Reuse unchanged message objects so memoized rows skip re-rendering after a refresh.
 * A reply still streaming keeps whichever copy is newer by stream sequence, so a saved
 * snapshot never rolls back text this tab already received (no flicker, no duplication).
 */
export function reconcile(
  previous: AvenMessageRecord[],
  next: AvenMessageRecord[],
) {
  const byKey = new Map(previous.map((item) => [messageKey(item), item]));
  return next.map((item) => {
    const existing = byKey.get(messageKey(item));
    if (!existing) return item;
    if (
      existing.status === "streaming" &&
      item.status === "streaming" &&
      messageSeq(item) <= messageSeq(existing)
    )
      return existing;
    return same(existing, item) ? existing : item;
  });
}
interface Options {
  goalId: string | null;
  goalTitle?: string;
  onError: (code: string) => void;
}
export function useAvenConversation({ goalId, goalTitle, onError }: Options) {
  const [selected, setSelected] = useState<string | null>(null),
    [messages, setMessages] = useState<AvenMessageRecord[]>([]),
    [proposals, setProposals] = useState<ProposalRecord[]>([]),
    [hasOlder, setHasOlder] = useState(false),
    [activeGoal, setActiveGoal] = useState(goalId),
    [contextTitle, setContextTitle] = useState(goalTitle),
    [loading, setLoading] = useState(false),
    [loadingOlder, setLoadingOlder] = useState(false),
    [generation, setGeneration] = useState<ConversationResult["generation"]>();
  const cache = useRef(new Map<string, ConversationResult>()),
    pending = useRef<AbortController | null>(null),
    current = useRef<string | null>(null),
    errorRef = useRef(onError);
  useEffect(() => {
    errorRef.current = onError;
  }, [onError]);
  // No abort on unmount: React's dev double-mount would cancel the only load and leave the
  // conversation on its skeleton. Switching conversations still aborts the previous load.
  const apply = useCallback((value: ConversationResult) => {
    cache.current.set(value.conversation.id, value);
    setHasOlder(value.hasOlder);
    setMessages((previous) => {
      const next = reconcile(previous, value.messages),
        keys = new Set(next.map(messageKey)),
        first = next[0]?.createdAt;
      // Keep older pages the reader already loaded; the refresh only returns the newest page.
      const older = first
        ? previous.filter(
            (item) =>
              !keys.has(messageKey(item)) &&
              item.createdAt &&
              item.createdAt < first,
          )
        : [];
      return [...older, ...next];
    });
    setProposals(value.proposals);
    setGeneration(value.generation);
    setActiveGoal(value.conversation.goalId);
    setContextTitle(value.conversation.goalTitle ?? undefined);
  }, []);
  /** Fetch the latest saved state without showing a loading state. */
  const reload = useCallback(
    async (id: string) => {
      const value = await featureRequest<ConversationResult>(
        `/api/aven?conversation=${id}`,
      );
      if (current.current === id) apply(value);
      else cache.current.set(id, value);
      return value;
    },
    [apply],
  );
  /** Switch conversations in place; cached history renders immediately and refreshes in the background. */
  const open = useCallback(
    (id: string) => {
      pending.current?.abort();
      current.current = id;
      setSelected(id);
      const cached = cache.current.get(id);
      if (cached) {
        setMessages([]);
        apply(cached);
        setLoading(false);
      } else {
        setGeneration(undefined);
        setMessages([]);
        setProposals([]);
        setHasOlder(false);
        setLoading(true);
      }
      const controller = new AbortController();
      pending.current = controller;
      void featureRequest<ConversationResult>(
        `/api/aven?conversation=${id}`,
        undefined,
        controller.signal,
      )
        .then((value) => {
          if (!controller.signal.aborted && current.current === id)
            apply(value);
        })
        .catch((failure) => {
          if (!controller.signal.aborted) errorRef.current(failure.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    },
    [apply],
  );
  /** Adopt an id assigned by the server for a conversation that started locally. */
  const adopt = useCallback((id: string) => {
    current.current = id;
    setSelected(id);
  }, []);
  const reset = useCallback(() => {
    pending.current?.abort();
    current.current = null;
    setSelected(null);
    setGeneration(undefined);
    setMessages([]);
    setProposals([]);
    setHasOlder(false);
    setLoading(false);
    setActiveGoal(goalId);
    setContextTitle(goalTitle);
  }, [goalId, goalTitle]);
  const forget = useCallback((id: string) => cache.current.delete(id), []);
  const loadOlder = useCallback(async () => {
    const id = current.current,
      first = messages[0];
    if (!id || !first || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await featureRequest<ConversationResult>(
        `/api/aven?conversation=${id}&before=${first.id}`,
      );
      if (current.current !== id) return;
      setMessages((existing) => {
        const known = new Set(existing.map(messageKey));
        return [
          ...older.messages.filter((item) => !known.has(messageKey(item))),
          ...existing,
        ];
      });
      setHasOlder(older.hasOlder);
    } catch (failure) {
      errorRef.current((failure as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder]);
  return {
    selected,
    generation,
    setGeneration,
    messages,
    setMessages,
    proposals,
    setProposals,
    hasOlder,
    activeGoal,
    contextTitle,
    loading,
    loadingOlder,
    open,
    adopt,
    reset,
    reload,
    forget,
    loadOlder,
  };
}
