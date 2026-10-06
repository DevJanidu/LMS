import { z } from "zod";
export const uuidSchema = z.string().uuid();
const optionalId = uuidSchema.optional();
const title = z.string().trim().min(1).max(150);
const color = z.enum(["brand", "success", "orange", "purple"]);
const optionalDate = z.iso.date().optional();
export const timezoneSchema = z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } });
export const subjectSchema = z.object({ id: uuidSchema, title, description: z.string().max(10000), color, targetDate: optionalDate, status: z.enum(["active", "archived"]) });
export const topicSchema = z.object({ id: uuidSchema, subjectId: uuidSchema, title, description: z.string().max(20000).optional(), status: z.enum(["notStarted", "inProgress", "completed"]), targetDate: optionalDate, sortOrder: z.number().int().min(0).max(199), archived: z.boolean().optional() });
export const urlSchema = z.string().url().max(2048).refine(value => ["http:", "https:"].includes(new URL(value).protocol));
export const resourceSchema = z.object({ id: uuidSchema, subjectId: uuidSchema, topicId: optionalId, type: z.enum(["file", "link", "video", "note"]), title, url: urlSchema.optional(), textContent: z.string().max(100000).optional() }).superRefine((value, ctx) => {
  if ((value.type === "link" || value.type === "video") && !value.url) ctx.addIssue({ code: "custom", path: ["url"], message: "A valid HTTP or HTTPS URL is required." });
  if (value.type === "note" && !value.textContent?.trim()) ctx.addIssue({ code: "custom", path: ["textContent"], message: "Enter note text." });
});
export const sessionSchema = z.object({ id: uuidSchema, subjectId: uuidSchema, topicId: optionalId, startedAt: z.iso.datetime(), endedAt: z.iso.datetime(), note: z.string().max(20000).optional() }).refine(value => Date.parse(value.endedAt) > Date.parse(value.startedAt), { message: "End time must be after start time." }).refine(value => Date.parse(value.endedAt) <= Date.now(), { message: "Study sessions cannot be in the future." });
export const exceptionSchema = z.object({ date: z.iso.date(), cancelled: z.boolean(), startsAt: z.iso.datetime().optional(), endsAt: z.iso.datetime().optional(), title: title.optional(), note: z.string().max(20000).optional(), color: color.optional(), subjectId: optionalId, topicId: optionalId }).refine(value => value.cancelled || Boolean(value.startsAt && value.endsAt && Date.parse(value.endsAt) > Date.parse(value.startsAt))).refine(value => !value.topicId || Boolean(value.subjectId));
export const blockSchema = z.object({ id: uuidSchema, subjectId: optionalId, topicId: optionalId, title, startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), repeat: z.enum(["once", "weekly"]), weekdays: z.array(z.number().int().min(0).max(6)).max(7), recurrenceUntil: optionalDate, timezone: timezoneSchema, note: z.string().max(20000).optional(), color, exceptions: z.array(exceptionSchema).max(1000) }).refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt)).refine(value => value.repeat !== "weekly" || value.weekdays.length > 0).refine(value => !value.topicId || Boolean(value.subjectId));
export const profileSchema = z.object({ name: z.string().trim().min(1).max(150), timezone: timezoneSchema, learningContext: z.enum(["school", "university", "exam", "selfStudy", "other"]).optional(), weeklyTargetMinutes: z.number().int().min(0).max(10080), theme: z.enum(["light", "dark", "auto"]), weekStartDay: z.union([z.literal(0), z.literal(1)]), reminders: z.boolean() });
export const settingsSchema = z.object({ streakMinutes: z.number().int().min(1).max(1440), maxFileSizeMB: z.number().int().min(1).max(100), storagePerUserMB: z.number().int().min(1).max(10000), minimumAge: z.number().int().min(0).max(120).optional() });
export const timerCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("start"), subjectId: uuidSchema, topicId: optionalId, focusGoal: z.string().max(200).optional() }),
  z.object({ command: z.enum(["pause", "resume", "confirm", "discard"]) }),
  z.object({ command: z.literal("finish"), note: z.string().max(20000).optional() }),
]);
export const uploadTypes: Record<string, string[]> = {
  "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "text/plain": ["txt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ["pptx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
};
export const uploadSchema = z.object({ subjectId: uuidSchema, topicId: optionalId, title, name: z.string().min(1).max(255), mimeType: z.string(), sizeBytes: z.number().int().positive() }).refine(value => uploadTypes[value.mimeType]?.includes(value.name.split(".").at(-1)?.toLowerCase() ?? ""), { message: "Choose a PDF, Office document, text file, PNG or JPEG." });
