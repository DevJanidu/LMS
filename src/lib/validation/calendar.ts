import { z } from "zod";
import { blockSchema, uuidSchema } from "./index";

const target = {
  id: uuidSchema,
  date: z.iso.date(),
  scope: z.enum(["one", "future", "all"]),
  newSeriesId: uuidSchema.optional(),
};
export const calendarCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), value: blockSchema }),
  z.object({ kind: z.literal("edit"), ...target, value: blockSchema }),
  z.object({ kind: z.literal("move"), ...target, startsAt: z.iso.datetime(), endsAt: z.iso.datetime() }),
  z.object({ kind: z.literal("delete"), ...target }),
]).superRefine((command, ctx) => {
  if (command.kind !== "create" && command.scope === "future" && command.kind !== "delete" && !command.newSeriesId)
    ctx.addIssue({ code: "custom", message: "A split series ID is required." });
  if (command.kind === "move" && Date.parse(command.endsAt) <= Date.parse(command.startsAt))
    ctx.addIssue({ code: "custom", message: "End time must follow start time." });
});
export const calendarMutationSchema = z.object({
  operationId: uuidSchema,
  expectedUpdatedAt: z.iso.datetime().optional(),
  command: calendarCommandSchema,
});
export type CalendarCommand = z.infer<typeof calendarCommandSchema>;
export type CalendarMutation = z.infer<typeof calendarMutationSchema>;
