import { z } from "zod";
import { goalCardSchema, nextActionsSchema } from "./validation";
/**
 * Generative UI registry. Aven never sends markup or code: each component is an approved
 * `type` with a versioned, validated payload built on the server from verified tool output.
 * The client renders only types listed here and re-validates every payload before rendering,
 * so a stored or streamed payload can never become arbitrary UI.
 */
const day = z.iso.date();
const title = z.string().max(200);
const topicRef = z.object({ id: z.uuid(), title, targetDate: day.nullable() });
export const uiComponentSchemas = {
  goal_progress: {
    version: 1,
    schema: z.object({ goals: z.array(goalCardSchema).min(1).max(4) }),
  },
  next_actions: {
    version: 1,
    schema: z.object({ actions: nextActionsSchema.min(1) }),
  },
  topic_coverage: {
    version: 1,
    schema: z.object({
      subject: z.object({ id: z.uuid(), title }),
      counts: z.object({
        required: z.number().int().min(0),
        completed: z.number().int().min(0),
        remaining: z.number().int().min(0),
        inProgress: z.number().int().min(0),
        overdue: z.number().int().min(0),
      }),
      overdue: z.array(topicRef).max(5),
      /** Open topics in the subject's own order; an ordering, not a recommendation engine. */
      nextTopics: z.array(topicRef).max(3),
    }),
  },
  study_analytics: {
    version: 1,
    schema: z.object({
      periodDays: z.number().int().min(1).max(366),
      minutes: z.number().int().min(0),
      sessions: z.number().int().min(0),
      previous: z
        .object({
          minutes: z.number().int().min(0),
          sessions: z.number().int().min(0),
        })
        .nullable(),
    }),
  },
  task_list: {
    version: 1,
    schema: z.object({
      goalId: z.uuid(),
      goalTitle: title,
      tasks: z
        .array(
          z.object({
            id: z.uuid(),
            title,
            status: z.string().max(40),
            priority: z.string().max(40),
            dueDate: day.nullable(),
            overdue: z.boolean(),
          }),
        )
        .min(1)
        .max(8),
      remaining: z.number().int().min(0),
    }),
  },
  circle_leaderboard: {
    version: 1,
    schema: z.object({
      weekEndsAt: z.iso.datetime({ offset: true }),
      me: z.object({
        rank: z.number().int().min(1).nullable(),
        minutes: z.number().int().min(0),
        minutesBehindNext: z.number().int().min(0).nullable(),
      }),
      rows: z
        .array(
          z.object({
            rank: z.number().int().min(1),
            name: z.string().max(120),
            minutes: z.number().int().min(0),
            me: z.boolean(),
          }),
        )
        .max(10),
    }),
  },
} as const;
export type UiComponentType = keyof typeof uiComponentSchemas;
export type UiComponentData<T extends UiComponentType> = z.infer<
  (typeof uiComponentSchemas)[T]["schema"]
>;
export const UI_COMPONENT_TYPES = Object.keys(
  uiComponentSchemas,
) as UiComponentType[];
export type UiComponent = {
  [T in UiComponentType]: {
    id: string;
    type: T;
    version: number;
    status: "loading" | "ready" | "removed";
    data?: UiComponentData<T>;
  };
}[UiComponentType];
export type ReadyUiComponent = UiComponent & { status: "ready" };
const envelope = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(UI_COMPONENT_TYPES as [UiComponentType, ...UiComponentType[]]),
  version: z.number().int().min(1),
  status: z.enum(["loading", "ready", "removed"]),
  data: z.unknown().optional(),
});
/**
 * Validates an envelope from the network or storage. Unknown types, newer versions this
 * build cannot render and payloads failing their schema are dropped (null), never guessed.
 */
export function parseUiComponent(raw: unknown): UiComponent | null {
  const parsed = envelope.safeParse(raw);
  if (!parsed.success) return null;
  const { id, type, version, status } = parsed.data;
  const entry = uiComponentSchemas[type];
  if (version > entry.version) return null;
  if (status !== "ready") return { id, type, version, status } as UiComponent;
  const data = entry.schema.safeParse(parsed.data.data);
  return data.success
    ? ({ id, type, version, status, data: data.data } as UiComponent)
    : null;
}
/** Builds a ready component, or null when the payload does not satisfy the registry. */
export function readyComponent<T extends UiComponentType>(
  type: T,
  data: unknown,
  id: string = type,
): ReadyUiComponent | null {
  const parsed = uiComponentSchemas[type].schema.safeParse(data);
  return parsed.success
    ? ({
        id,
        type,
        version: uiComponentSchemas[type].version,
        status: "ready",
        data: parsed.data,
      } as ReadyUiComponent)
    : null;
}
/**
 * Components saved with a reply. Older replies stored goal cards and next actions under
 * their own keys before the registry existed; they are migrated here on read.
 */
export function storedComponents(
  context: Record<string, string> | null | undefined,
): ReadyUiComponent[] {
  if (!context) return [];
  const read = (raw?: string) => {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return undefined;
    }
  };
  const saved = read(context.components);
  if (Array.isArray(saved))
    return saved
      .map(parseUiComponent)
      .filter((item): item is ReadyUiComponent => item?.status === "ready");
  return [
    readyComponent("goal_progress", { goals: read(context.goalCards) }),
    readyComponent("next_actions", { actions: read(context.nextActions) }),
  ].filter((item): item is ReadyUiComponent => Boolean(item));
}
/** Merges an incoming event into an ordered component list; arrival order is display order. */
export function applyUiComponent(list: UiComponent[], next: UiComponent) {
  const index = list.findIndex((item) => item.id === next.id);
  if (next.status === "removed")
    return index < 0 ? list : list.filter((item) => item.id !== next.id);
  // A late loading event never hides data that is already shown.
  if (index >= 0 && next.status === "loading" && list[index].status === "ready")
    return list;
  if (index < 0) return [...list, next];
  const copy = [...list];
  copy[index] = next;
  return copy;
}
