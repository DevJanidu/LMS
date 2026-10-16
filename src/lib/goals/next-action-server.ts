import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay } from "@/lib/analytics";
import { aiPreferenceSchema } from "@/lib/aven/validation";
import { learningRankingContext } from "@/lib/learning/server";
import { getGoalDetailsBatch } from "./service";
import { rankNextActions } from "./next-action";
/** Account-scoped Next Best Action; reads only the learner's own active goals. */
export async function getNextBestActions(
  userId: string,
  options: { goalId?: string | null; limit?: number } = {},
) {
  const db = getDb();
  const [goals, [user], [preferences]] = await Promise.all([
    db
      .select({ id: s.goals.id })
      .from(s.goals)
      .where(
        and(
          eq(s.goals.userId, userId),
          inArray(s.goals.status, ["active", "planned", "missedTarget"]),
          options.goalId ? eq(s.goals.id, options.goalId) : undefined,
        ),
      )
      .orderBy(asc(s.goals.targetDate))
      .limit(20),
    db
      .select({ timezone: s.users.timezone })
      .from(s.users)
      .where(eq(s.users.id, userId)),
    db
      .select({ value: s.aiUserPreferences.value })
      .from(s.aiUserPreferences)
      .where(eq(s.aiUserPreferences.userId, userId)),
  ]);
  const daily = aiPreferenceSchema.safeParse(preferences?.value ?? {});
  const timezone = user?.timezone ?? "UTC";
  const [details, learning] = await Promise.all([
    getGoalDetailsBatch(
      userId,
      goals.map((goal) => goal.id),
    ),
    // Ranking still works when learning context is unavailable; it only adds reasons.
    learningRankingContext(
      userId,
      daily.success ? daily.data.learningSignals : [],
      timezone,
    ).catch(() => ({ difficulty: {}, postponedTopics: {} })),
  ]);
  return rankNextActions(
    details,
    {
      today: localDay(Date.now(), timezone),
      now: Date.now(),
      dailyTargetMinutes: daily.success ? daily.data.dailyTargetMinutes : 90,
      ...learning,
    },
    options.limit ?? 3,
    options.goalId,
  );
}
