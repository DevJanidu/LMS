import { z } from "zod";
import { blockSchema, profileSchema, resourceSchema, sessionSchema, settingsSchema, subjectSchema, timerCommandSchema, topicSchema, uuidSchema } from "./index";
export const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subject"), value: subjectSchema }),
  z.object({ kind: z.literal("topic"), value: topicSchema }),
  z.object({ kind: z.literal("resource"), value: resourceSchema }),
  z.object({ kind: z.literal("session"), value: sessionSchema }),
  z.object({ kind: z.literal("block"), value: blockSchema }),
  z.object({ kind: z.literal("delete"), entity: z.enum(["subject", "topic", "resource", "session", "block"]), id: uuidSchema }),
  z.object({ kind: z.literal("profile"), value: profileSchema }),
  z.object({ kind: z.literal("settings"), value: settingsSchema }),
  z.object({ kind: z.literal("userStatus"), id: uuidSchema, status: z.enum(["active", "inactive"]) }),
  z.object({ kind: z.literal("readNotification"), id: uuidSchema }),
  z.object({ kind: z.literal("timer"), value: timerCommandSchema }),
]);
export const operationsSchema = z.array(operationSchema).min(1).max(500);
export type Operation = z.infer<typeof operationSchema>;
