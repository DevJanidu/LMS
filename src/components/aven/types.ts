import type { avenBootstrap } from "@/lib/aven/conversations";
import type { GenerationView } from "@/lib/aven/generation-state";
import type { UiComponent } from "@/lib/aven/ui-components";
import type { ProposalRecord } from "./ProposalCard";
export type Bootstrap = Awaited<ReturnType<typeof avenBootstrap>>;
export type Preferences = Bootstrap["preferences"];
export type ConversationSummary = Bootstrap["conversations"][number];
export interface AvenMessageRecord {
  id: string;
  role: string;
  content: string;
  status: string;
  requestId?: string;
  createdAt?: string;
  context?: Record<string, string> | null;
  /** Client-only: live cards, including placeholders still loading. */
  components?: UiComponent[];
  /** Client-only: the last stream sequence number reflected in this record. */
  seq?: number;
}
export interface ConversationResult {
  hasOlder: boolean;
  conversation: {
    id: string;
    title?: string;
    goalId: string | null;
    goalTitle: string | null;
    summary: string;
  };
  messages: AvenMessageRecord[];
  proposals: ProposalRecord[];
  /** Server-authoritative state of the latest generation (any tab or device). */
  generation?: GenerationView | null;
}
/** Database rows are unique per (conversation, requestId, role), so this key survives reconciliation. */
export const messageKey = (message: AvenMessageRecord) =>
  message.requestId ? `${message.role}:${message.requestId}` : message.id;
/** Sequence number a record reflects: live records carry it, saved snapshots store it. */
export const messageSeq = (message: AvenMessageRecord) =>
  message.seq ?? (Number(message.context?.seq ?? -1) || 0);
export const errorKey = (
  t: { has: (key: string) => boolean },
  code: string,
  fallback = "serviceUnavailable",
) => `errors.${t.has(`errors.${code}`) ? code : fallback}`;
