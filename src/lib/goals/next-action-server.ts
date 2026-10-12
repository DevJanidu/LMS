import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { localDay } from "@/lib/analytics";
import { aiPreferenceSchema } from "@/lib/aven/validation";
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
  const details = await getGoalDetailsBatch(
    userId,
    goals.map((goal) => goal.id),
  );
  const daily = aiPreferenceSchema.safeParse(preferences?.value ?? {});
  return rankNextActions(
    details,
    {
      today: localDay(Date.now(), user?.timezone ?? "UTC"),
      now: Date.now(),
      dailyTargetMinutes: daily.success ? daily.data.dailyTargetMinutes : 90,
    },
    options.limit ?? 3,
    options.goalId,
  );
}
