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
import type { GoalCard } from "@/lib/aven/validation";
import type { ProposalRecord } from "./ProposalCard";
import { activityCategory } from "./AvenActivity";
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
interface StreamEvent {
  type: string;
  id?: string;
  text?: string;
  code?: string;
  name?: string;
  proposal?: ProposalRecord;
  cards?: GoalCard[];
  actions?: unknown[];
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
export function useAvenStream(options: Options) {
  const [generating, setGenerating] = useState(false),
    [activity, setActivity] = useState<string>(),
    [streamingKey, setStreamingKey] = useState<string>();
  const optionsRef = useRef(options),
    abort = useRef<AbortController | null>(null),
    stopped = useRef(false),
    active = useRef<{
      conversationId: string | null;
      requestId: string;
    } | null>(null);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => () => abort.current?.abort(), []);
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
      setGenerating(true);
      setActivity("working");
      setStreamingKey(`assistant:${requestId}`);
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
        },
      ]);
      // Deltas arrive faster than the screen refreshes; append them once per frame.
      let buffer = "",
        frame = 0;
      const flush = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (!buffer) return;
        const text = buffer;
        buffer = "";
        patch(setMessages, assistantId, (message) => ({
          content: message.content + text,
        }));
      };
      const controller = new AbortController();
      abort.current = controller;
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
        for await (const raw of responseEvents(response.body)) {
          const event = raw as unknown as StreamEvent;
          if (event.type === "delta" && event.text) {
            buffer += event.text;
            frame ||= requestAnimationFrame(flush);
            setActivity(undefined);
            continue;
          }
          flush();
          if (event.type === "conversation" && event.id) {
            conversationId = event.id;
            accepted = true;
            active.current = { conversationId, requestId };
            optionsRef.current.onAccepted(event.id, submission);
            patch(setMessages, requestId, () => ({ status: "complete" }));
          } else if (event.type === "tool")
            setActivity(activityCategory(event.name ?? "working"));
          else if (event.type === "replace") {
            setActivity(undefined);
            patch(setMessages, assistantId, () => ({
              content: event.text ?? "",
            }));
          } else if (event.type === "proposal" && event.proposal) {
            const proposal = {
              ...event.proposal,
              createdAt: event.proposal.createdAt ?? new Date().toISOString(),
            };
            setProposals((current) => [
              ...current.filter((item) => item.id !== proposal.id),
              proposal,
            ]);
            // The server holds further text until it verifies no change is claimed as applied.
            setActivity("changes");
          } else if (event.type === "goalProgress" && event.cards)
            patch(setMessages, assistantId, (message) => ({
              context: {
                ...message.context,
                goalCards: JSON.stringify(event.cards),
              },
            }));
          else if (event.type === "nextActions" && event.actions)
            patch(setMessages, assistantId, (message) => ({
              context: {
                ...message.context,
                nextActions: JSON.stringify(event.actions),
              },
            }));
          else if (event.type === "error")
            throw new Error(event.code ?? "aiUnavailable");
          else if (event.type === "done") completed = true;
        }
        flush();
        if (!completed) throw new Error("generationInterrupted");
        patch(setMessages, assistantId, () => ({ status: "complete" }));
        setActivity(undefined);
        if (conversationId)
          await optionsRef.current.reload(conversationId).catch(() => {});
        return { ok: true, accepted };
      } catch (failure) {
        flush();
        const code = stopped.current
          ? "generationStopped"
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
          // Keep the partial reply in place; the server keeps the same text where it can.
          if (!recovered)
            patch(setMessages, assistantId, (message) => ({
              status: "cancelled",
              content: message.content || "generationStopped",
            }));
          return { ok: false, accepted, code };
        }
        if (accepted && conversationId) {
          await optionsRef.current.reload(conversationId).catch(() => {});
          return { ok: false, accepted, code };
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
        return { ok: false, accepted, code };
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
  return { generating, activity, streamingKey, send, stop };
}
