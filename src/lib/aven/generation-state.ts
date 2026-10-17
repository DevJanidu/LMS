import { knownActivity, type ActivityCategory } from "./activity";
import { storedComponents, type ReadyUiComponent } from "./ui-components";
/**
 * Durable generation states. A generation is identified by its client-generated requestId
 * (also the idempotency key) and persisted as the assistant reply row plus the
 * conversation lease; this module derives the public state from those two records.
 */
export type GenerationStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled";
export const TERMINAL_STATUSES: GenerationStatus[] = [
  "waiting_for_approval",
  "completed",
  "failed",
  "cancelled",
];
export const isActiveGeneration = (status?: GenerationStatus) =>
  status === "queued" || status === "running";
export interface GenerationView {
  requestId: string;
  status: GenerationStatus;
  /** Last stream sequence number included in this snapshot. */
  seq: number;
  activity: ActivityCategory | null;
  content: string;
  components: ReadyUiComponent[];
  errorCode: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  leaseUntil: string | null;
}
interface ReplyRow {
  requestId: string;
  status: string;
  content: string;
  context: Record<string, string> | null;
  createdAt: Date | string | null;
}
interface Lease {
  activeRequestId: string | null;
  lockedUntil: Date | null;
}
const iso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
/** Whether this request still holds the conversation lease (i.e. a live run owns it). */
export const holdsLease = (lease: Lease, requestId: string, now = Date.now()) =>
  lease.activeRequestId === requestId &&
  Boolean(lease.lockedUntil) &&
  lease.lockedUntil!.getTime() > now;
export function describeGeneration(
  row: ReplyRow,
  lease: Lease,
  pendingProposals: number,
  now = Date.now(),
): GenerationView {
  const context = row.context ?? {};
  let status: GenerationStatus;
  if (row.status === "streaming")
    // A snapshot without a live lease belongs to a run that crashed or timed out.
    status = holdsLease(lease, row.requestId, now)
      ? context.phase === "queued"
        ? "queued"
        : "running"
      : "failed";
  else if (row.status === "complete")
    status = pendingProposals > 0 ? "waiting_for_approval" : "completed";
  else if (row.status === "cancelled") status = "cancelled";
  else status = "failed";
  const interrupted = row.status === "streaming" && status === "failed";
  return {
    requestId: row.requestId,
    status,
    seq: Number(context.seq ?? 0) || 0,
    activity: isActiveGeneration(status) ? knownActivity(context.activity) : null,
    content: row.content,
    components: storedComponents(context),
    errorCode: interrupted
      ? "generationInterrupted"
      : status === "failed" && /^[a-zA-Z]+$/.test(row.content)
        ? row.content
        : null,
    createdAt: iso(row.createdAt),
    updatedAt: context.updatedAt ?? iso(row.createdAt),
    leaseUntil:
      isActiveGeneration(status) && lease.lockedUntil ? iso(lease.lockedUntil) : null,
  };
}
