import type { avenBootstrap } from "@/lib/aven/conversations";
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
}
/** Database rows are unique per (conversation, requestId, role), so this key survives reconciliation. */
export const messageKey = (message: AvenMessageRecord) =>
  message.requestId ? `${message.role}:${message.requestId}` : message.id;
export const errorKey = (
  t: { has: (key: string) => boolean },
  code: string,
  fallback = "serviceUnavailable",
) => `errors.${t.has(`errors.${code}`) ? code : fallback}`;
