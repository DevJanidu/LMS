import type { Workspace } from "@/types";
import type { Operation } from "@/lib/validation/operations";
import { optimisticOperations } from "./mutations";

/** Only rows affected by this transaction; never an entire paginated collection. */
export type WorkspaceChanges = Partial<Pick<Workspace, "subjects" | "topics" | "resources" | "sessions" | "blocks" | "notifications" | "settings" | "timer">> & {
  profile?: Omit<Partial<Workspace["user"]>, "learningContext"> & { learningContext?: string | null };
  users?: Array<Pick<Workspace["user"], "id" | "status" | "updatedAt">>;
  deleted?: Extract<Operation, { kind: "delete" }>[];
};
export interface MutationConfirmation {
  ok: boolean;
  error?: string;
  uncertain?: boolean;
  timerResult?: "saved" | "discarded";
  userUpdatedAt?: string;
  changes?: WorkspaceChanges;
}
export function reconcileChanges(data: Workspace, changes: WorkspaceChanges = {}): Workspace {
  let next = changes.deleted?.length ? optimisticOperations(data, changes.deleted) : data;
  for (const field of ["subjects", "topics", "resources", "sessions", "blocks", "notifications"] as const) {
    const rows = changes[field];
    if (!rows) continue;
    const ids = new Set(rows.map(row => row.id));
    next = { ...next, [field]: [...next[field].filter(row => !ids.has(row.id)), ...new Map(rows.map(row => [row.id, row])).values()] };
  }
  if (changes.profile) next = { ...next, user: { ...next.user, ...changes.profile, learningContext: "learningContext" in changes.profile ? changes.profile.learningContext ?? undefined : next.user.learningContext } };
  if (changes.users) next = { ...next, users: next.users.map(user => ({ ...user, ...changes.users!.find(row => row.id === user.id) })) };
  if (changes.settings) next = { ...next, settings: changes.settings };
  if ("timer" in changes) next = { ...next, timer: changes.timer ?? null };
  return next;
}
