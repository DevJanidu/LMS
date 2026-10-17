import type { ActivityCategory } from "./activity";
import type { UiComponent } from "./ui-components";
/**
 * Acadence's own streaming protocol between /api/aven/chat and the browser. Provider
 * events (OpenAI Responses API) are mapped onto these on the server; the client never sees
 * provider payloads, tool arguments or reasoning. Every event carries a per-generation
 * sequence number so duplicates are ignored and recovery snapshots can be ordered.
 */
export const STREAM_PROTOCOL_VERSION = 1;
/** The server writes at least this often, so a silent connection can be detected. */
export const HEARTBEAT_MS = 8000;
/** No bytes for this long means the connection is dead even if the socket looks open. */
export const STREAM_IDLE_TIMEOUT_MS = 25000;
export type StreamEventBody =
  | { type: "message-start"; conversationId: string; requestId: string }
  /** A user-safe status for the current step (never model reasoning). */
  | { type: "reasoning-status"; status: ActivityCategory }
  | { type: "text-delta"; text: string }
  /** Replaces the whole visible text, e.g. after a server-side safety correction. */
  | { type: "text-replace"; text: string }
  | { type: "tool-start"; callId: string; activity: ActivityCategory }
  | { type: "tool-result"; callId: string; activity: ActivityCategory; ok: boolean }
  | { type: "ui-component"; component: UiComponent }
  | { type: "proposal"; proposal: Record<string, unknown> }
  | { type: "heartbeat" }
  | { type: "message-complete"; conversationId: string }
  | { type: "error"; code: string; conversationId?: string };
export type StreamEvent = StreamEventBody & { seq: number; v?: number };
export type StreamEventType = StreamEventBody["type"];
const TYPES = new Set<StreamEventType>([
  "message-start",
  "reasoning-status",
  "text-delta",
  "text-replace",
  "tool-start",
  "tool-result",
  "ui-component",
  "proposal",
  "heartbeat",
  "message-complete",
  "error",
]);
/** Structural check for an event read off the wire; unknown event types are skipped. */
export function isStreamEvent(value: unknown): value is StreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; seq?: unknown };
  return (
    typeof event.type === "string" &&
    TYPES.has(event.type as StreamEventType) &&
    typeof event.seq === "number" &&
    Number.isInteger(event.seq) &&
    event.seq > 0
  );
}
/**
 * Delivery guard: events are applied at most once and in order. A repeated or stale
 * sequence number (a retransmission, a replay after reconnect) is dropped.
 */
export function createSequenceGuard(start = 0) {
  let last = start;
  return {
    accept(seq: number) {
      if (seq <= last) return false;
      last = seq;
      return true;
    },
    get last() {
      return last;
    },
  };
}
