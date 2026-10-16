import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  featureFailure,
  learnerAccount,
  privateJson,
  validatedBody,
} from "@/lib/goals/http";
import { aiPreferenceSchema } from "@/lib/aven/validation";
import { saveLearningSignal } from "@/lib/learning/server";
import { confidenceLevels } from "@/lib/learning/signals";
/** The learner's own difficulty and confidence reports: list, add (after a session) and remove. */
const mutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("report"),
    subjectId: z.uuid(),
    topicId: z.uuid().nullable().default(null),
    level: z.enum(confidenceLevels),
  }),
  z.object({
    kind: z.literal("remove"),
    subjectId: z.uuid(),
    topicId: z.uuid().nullable(),
  }),
]);
export async function GET() {
  try {
    const user = await learnerAccount(),
      db = getDb();
    const [row] = await db
      .select({ value: s.aiUserPreferences.value })
      .from(s.aiUserPreferences)
      .where(eq(s.aiUserPreferences.userId, user.id));
    const signals = aiPreferenceSchema.parse(row?.value ?? {}).learningSignals;
    const subjectIds = [...new Set(signals.map((item) => item.subjectId))];
    const topicIds = signals.flatMap((item) => (item.topicId ? [item.topicId] : []));
    const [subjects, topics] = await Promise.all([
      subjectIds.length
        ? db
            .select({ id: s.subjects.id, title: s.subjects.title })
            .from(s.subjects)
            .where(and(eq(s.subjects.userId, user.id), inArray(s.subjects.id, subjectIds)))
        : [],
      topicIds.length
        ? db
            .select({ id: s.topics.id, title: s.topics.title })
            .from(s.topics)
            .innerJoin(s.subjects, eq(s.subjects.id, s.topics.subjectId))
            .where(and(eq(s.subjects.userId, user.id), inArray(s.topics.id, topicIds)))
        : [],
    ]);
    return privateJson({
      ok: true,
      signals: signals
        .filter((item) => subjects.some((subject) => subject.id === item.subjectId))
        .map((item) => ({
          ...item,
          subjectTitle: subjects.find((subject) => subject.id === item.subjectId)!.title,
          topicTitle: topics.find((topic) => topic.id === item.topicId)?.title ?? null,
        }))
        .reverse(),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await learnerAccount(),
      input = await validatedBody(request, mutationSchema);
    await getDb().transaction((tx) =>
      saveLearningSignal(
        tx,
        user.id,
        input.kind === "report"
          ? { subjectId: input.subjectId, topicId: input.topicId, level: input.level, source: "checkIn" }
          : { clear: true, subjectId: input.subjectId, topicId: input.topicId },
      ),
    );
    return privateJson({ ok: true });
  } catch (error) {
    return featureFailure(error);
  }
}
