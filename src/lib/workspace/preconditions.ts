import { z } from "zod";
import type { Workspace } from "@/types";
import type { Operation } from "@/lib/validation/operations";

const fields = {
  subject: ["title", "description", "color", "targetDate", "status", "updatedAt"],
  topic: ["subjectId", "title", "description", "status", "targetDate", "sortOrder", "archived", "updatedAt"],
  resource: ["subjectId", "topicId", "type", "title", "url", "textContent", "sizeBytes"],
  session: ["subjectId", "topicId", "startedAt", "endedAt", "durationSeconds", "note", "source"],
  profile: ["name", "timezone", "learningContext", "weeklyTargetMinutes", "theme", "weekStartDay", "reminders"],
  block: ["updatedAt"],
  timer: ["subjectId", "topicId", "startedAt", "pausedAt", "pausedTotalSeconds", "confirmedUntilSeconds"],
  settings: ["streakMinutes", "maxFileSizeMB", "storagePerUserMB", "minimumAge"],
  userStatus: ["status", "updatedAt"],
} as const;
export const preconditionsSchema = z.array(z.object({
  kind: z.enum(["subject", "topic", "resource", "session", "profile", "block", "timer", "settings", "userStatus"]),
  id: z.string().uuid(),
  values: z.record(z.string(), z.union([z.string().max(100000), z.number(), z.boolean(), z.null()])).nullable(),
}).refine(value => !value.values || Object.keys(value.values).every(key => (fields[value.kind] as readonly string[]).includes(key)))).max(500);
export type Precondition = z.infer<typeof preconditionsSchema>[number];
export type OriginalRecord = Workspace["subjects"][number] | Workspace["topics"][number] | Workspace["resources"][number] | Workspace["sessions"][number] | Workspace["users"][number];
function values(kind: Precondition["kind"], row: object): NonNullable<Precondition["values"]> {
  const record = row as Record<string, string | number | boolean | null | undefined>;
  return Object.fromEntries(fields[kind].filter(key => key in row).map(key => [key, record[key] ?? null]));
}
export function matchesPrecondition(condition: Precondition, current: object | undefined): boolean {
  if (!condition.values) return !current;
  if (!current) return false;
  const actual = values(condition.kind, current);
  return Object.entries(condition.values).every(([key, expected]) => (actual[key] ?? null) === expected);
}
export function mutationPreconditions(data: Workspace, operations: Operation[], original?: OriginalRecord): Precondition[] {
  return operations.flatMap(operation => {
    const kind = operation.kind === "delete" ? operation.entity : operation.kind;
    if (!(kind in fields)) return [];
    const checked = kind as Precondition["kind"];
    const id = "id" in operation ? operation.id : "value" in operation && "id" in operation.value ? operation.value.id : data.user.id;
    const collection = { subject: data.subjects, topic: data.topics, resource: data.resources, session: data.sessions, block: data.blocks, profile: [data.user], userStatus: data.users,
      timer: data.timer ? [{ ...data.timer, id: data.user.id }] : [], settings: [{ ...data.settings, id: data.user.id }] }[checked];
    const record = original?.id === id ? original : collection.find(row => row.id === id);
    // A delete may target a separately paginated row. Its ownership is still
    // checked server-side even if a caller has no preimage to compare.
    if (!record && operation.kind === "delete") return [];
    return [{ kind: checked, id, values: record ? values(checked, record) : null }];
  });
}
