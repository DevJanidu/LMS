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
import { responseEvents } from "@/lib/aven/stream";
import {
  STREAM_IDLE_TIMEOUT_MS,
  createSequenceGuard,
  isStreamEvent,
  type StreamEvent,
} from "@/lib/aven/stream-protocol";
import { applyUiComponent, parseUiComponent } from "@/lib/aven/ui-components";
import { knownActivity, type ActivityCategory } from "@/lib/aven/activity";
import type { ProposalRecord } from "./ProposalCard";
import type { AvenMessageRecord, ConversationResult } from "./types";
import type { MentionType } from "@/lib/aven/commands";
export interface SendRequest {
  text: string;
  conversationId: string | null;
  goalId: string | null;
  planning: boolean;
  notificationId?: string;
  /** Request id of a saved user message to answer again instead of creating a new message. */
  retryOf?: string;
  regenerate?: boolean;
  /** Structured @ references (type and ID only). */
  references?: { type: MentionType; id: string }[];
}
interface Options {
  setMessages: Dispatch<SetStateAction<AvenMessageRecord[]>>;
  setProposals: Dispatch<SetStateAction<ProposalRecord[]>>;
  onAccepted: (conversationId: string, title: string) => void;
  onRecovered: (value: ConversationResult) => void;
  reload: (conversationId: string) => Promise<unknown>;
}
export interface SendOutcome {
  ok: boolean;
  accepted: boolean;
  code?: string;
  /** The conversation the turn was saved to, once the server accepted it. */
  conversationId?: string | null;
  /** The viewer left (navigation, switching chats); the server keeps generating. */
  detached?: boolean;
}
const patch = (
  setMessages: Options["setMessages"],
  id: string,
  change: (message: AvenMessageRecord) => Partial<AvenMessageRecord>,
) =>
  setMessages((current) =>
    current.map((message) =>
      message.id === id ? { ...message, ...change(message) } : message,
    ),
  );
export class StreamIdle extends Error {
  constructor() {
    super("streamIdle");
  }
}
/**
 * Reads the protocol from a response body and aborts when no bytes (not even a heartbeat)
 * arrive for STREAM_IDLE_TIMEOUT_MS: a frozen tab or a half-open connection otherwise
 * leaves `read()` pending forever and the UI stuck in "generating".
 */
export async function* watchedEvents(
  body: ReadableStream<Uint8Array>,
  controller: AbortController,
  idleMs: number,
): AsyncGenerator<StreamEvent> {
  let timer: ReturnType<typeof setTimeout> | undefined,
    idle = false;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      idle = true;
      controller.abort();
    }, idleMs);
  };
  const counted = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, sink) {
        arm();
        sink.enqueue(chunk);
      },
    }),
  );
  arm();
  try {
    for await (const raw of responseEvents(counted))
      if (isStreamEvent(raw)) yield raw;
  } catch (failure) {
    throw idle ? new StreamIdle() : failure;
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (idle) throw new StreamIdle();
}
export function useAvenStream(options: Options) {
  const [generating, setGenerating] = useState(false),
    [activity, setActivity] = useState<ActivityCategory>(),
    [streamingKey, setStreamingKey] = useState<string>();
  const optionsRef = useRef(options),
    abort = useRef<AbortController | null>(null),
    stopped = useRef(false),
    detached = useRef(false),
    active = useRef<{
      conversationId: string | null;
      requestId: string;
    } | null>(null);
  useEffect(() => {
    optionsRef.current = options;
  });
  // Leaving the page only detaches this tab from the stream; the server keeps generating
  // and the reply is restored from durable state when the chat is shown again.
  useEffect(
    () => () => {
      detached.current = true;
      abort.current?.abort();
    },
    [],
  );
  const send = useCallback(
    async (request: SendRequest): Promise<SendOutcome> => {
      if (active.current) return { ok: false, accepted: false };
      const { setMessages, setProposals } = optionsRef.current;
      const submission = request.text.trim(),
        requestId = crypto.randomUUID(),
        assistantId = `${requestId}-assistant`,
        startedAt = new Date().toISOString();
      let conversationId = request.conversationId,
        accepted = Boolean(request.retryOf),
        completed = false;
      active.current = { conversationId, requestId };
      stopped.current = false;
      detached.current = false;
      setGenerating(true);
      setActivity("working");
      setStreamingKey(`assistant:${requestId}`);
      // The message appears immediately; the server confirms it with message-start.
      setMessages((current) => [
        ...current.filter((message) => message.status !== "notSent"),
        ...(request.retryOf
          ? []
          : [
              {
                id: requestId,
                requestId,
                role: "user",
                content: submission,
                status: "pending",
                createdAt: startedAt,
              },
            ]),
        {
          id: assistantId,
          requestId,
          role: "assistant",
          content: "",
          status: "streaming",
          createdAt: startedAt,
          seq: 0,
        },
      ]);
      // Deltas arrive faster than the screen refreshes; append them once per frame.
      let buffer = "",
        bufferSeq = 0,
        frame = 0;
      const flush = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (!buffer) return;
        const text = buffer,
          seq = bufferSeq;
        buffer = "";
        patch(setMessages, assistantId, (message) => ({
          content: message.content + text,
          seq,
        }));
      };
      const controller = new AbortController();
      abort.current = controller;
      const guard = createSequenceGuard();
      try {
        const response = await fetch("/api/aven/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            notificationId: request.notificationId ?? null,
            retryRequestId: request.retryOf ?? null,
            regenerate: request.regenerate ?? false,
            goalId: request.goalId,
            requestId,
            message: submission,
            planning: request.planning,
            references: request.references ?? [],
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const value = await response.json().catch(() => ({}));
          throw new Error(value.error ?? "aiUnavailable");
        }
        for await (const event of watchedEvents(
          response.body,
          controller,
          STREAM_IDLE_TIMEOUT_MS,
        )) {
          // Sequence numbers make delivery idempotent: a repeated or stale event is ignored.
          if (!guard.accept(event.seq)) continue;
          if (event.type === "heartbeat") continue;
          if (event.type === "text-delta") {
            buffer += event.text;
            bufferSeq = event.seq;
            frame ||= requestAnimationFrame(flush);
            setActivity(undefined);
            continue;
          }
          flush();
          const seq = event.seq;
          if (event.type === "message-start") {
            conversationId = event.conversationId;
            accepted = true;
            active.current = { conversationId, requestId };
            optionsRef.current.onAccepted(event.conversationId, submission);
            patch(setMessages, requestId, () => ({ status: "complete" }));
          } else if (event.type === "reasoning-status")
            setActivity(knownActivity(event.status));
          else if (event.type === "tool-start")
            setActivity(knownActivity(event.activity));
          else if (event.type === "text-replace") {
            setActivity(undefined);
            patch(setMessages, assistantId, () => ({ content: event.text, seq }));
          } else if (event.type === "ui-component") {
            const component = parseUiComponent(event.component);
            if (component)
              patch(setMessages, assistantId, (message) => ({
                components: applyUiComponent(message.components ?? [], component),
                seq,
              }));
          } else if (event.type === "proposal") {
            const proposal = {
              ...(event.proposal as unknown as ProposalRecord),
              createdAt:
                (event.proposal.createdAt as string | undefined) ??
                new Date().toISOString(),
            };
            setProposals((current) => [
              ...current.filter((item) => item.id !== proposal.id),
              proposal,
            ]);
            // The server holds further text until it verifies no change is claimed as applied.
            setActivity("changes");
          } else if (event.type === "error") throw new Error(event.code);
          else if (event.type === "message-complete") completed = true;
        }
        flush();
        if (!completed) throw new Error("generationInterrupted");
        patch(setMessages, assistantId, () => ({ status: "complete" }));
        setActivity(undefined);
        if (conversationId)
          await optionsRef.current.reload(conversationId).catch(() => {});
        return { ok: true, accepted, conversationId };
      } catch (failure) {
        flush();
        if (detached.current)
          return { ok: false, accepted, conversationId, detached: true };
        const code = stopped.current
          ? "generationStopped"
          : failure instanceof StreamIdle
            ? "generationInterrupted"
            : (failure as Error).message || "aiUnavailable";
        // The server may have saved the message before the stream broke; find its conversation.
        let recovered = false;
        if (!conversationId)
          try {
            const value = await featureRequest<
              ConversationResult & { found: boolean }
            >(`/api/aven?request=${requestId}`);
            if (value.found) {
              conversationId = value.conversation.id;
              accepted = recovered = true;
              optionsRef.current.onRecovered(value);
            }
          } catch {}
        if (stopped.current) {
          // Stopped before the server confirmed the turn: the stop request could not name the
          // conversation yet, and closing the stream alone no longer ends a generation.
          if (recovered && conversationId)
            await featureRequest("/api/aven/chat/cancel", {
              conversationId,
              requestId,
            })
              .then(() => optionsRef.current.reload(conversationId!))
              .catch(() => {});
          // Keep the partial reply in place; the server keeps the same text where it can.
          if (!recovered)
            patch(setMessages, assistantId, (message) => ({
              status: "cancelled",
              content: message.content || "generationStopped",
            }));
          return { ok: false, accepted, code, conversationId };
        }
        // An accepted turn lives on the server: the refresh shows its saved state, and a
        // reply still running there is followed from durable snapshots, not restarted.
        if (accepted && conversationId) {
          await optionsRef.current.reload(conversationId).catch(() => {});
          return { ok: false, accepted, code, conversationId };
        }
        setMessages((current) =>
          current
            .filter((message) => message.id !== assistantId)
            .map((message) =>
              message.id === requestId
                ? { ...message, status: "notSent" }
                : message,
            ),
        );
        return { ok: false, accepted, code, conversationId };
      } finally {
        if (frame) cancelAnimationFrame(frame);
        active.current = null;
        abort.current = null;
        setGenerating(false);
        setActivity(undefined);
        setStreamingKey(undefined);
      }
    },
    [],
  );
  const stop = useCallback(() => {
    const turn = active.current;
    if (!turn) return;
    stopped.current = true;
    if (turn.conversationId)
      void featureRequest("/api/aven/chat/cancel", {
        conversationId: turn.conversationId,
        requestId: turn.requestId,
      }).catch(() => {});
    abort.current?.abort();
  }, []);
  /** Stop listening without stopping the generation (e.g. switching conversations). */
  const detach = useCallback(() => {
    if (!active.current) return;
    detached.current = true;
    abort.current?.abort();
  }, []);
  return { generating, activity, streamingKey, send, stop, detach };
}
