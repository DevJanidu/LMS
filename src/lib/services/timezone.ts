import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { invalidateUser } from "@/lib/cache";
import { validTimezone } from "@/lib/timezone";
import { GoalError } from "@/lib/goals/service";
export async function synchronizeTimezone(userId: string, timezone: string) {
  if (!validTimezone(timezone)) throw new GoalError("invalidTimezone", 400);
  const result = await getDb().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!account || account.status !== "active")
      throw new GoalError("authenticationFailed", 401);
    if (account.timezoneMode === "manual" || account.timezone === timezone)
      return {
        changed: false,
        timezone: account.timezone,
        timezoneMode: account.timezoneMode,
        updatedAt: account.updatedAt.toISOString(),
      };
    const [updated] = await tx
      .update(users)
      .set({
        timezone,
        updatedAt: sql`greatest(${users.updatedAt} + interval '1 millisecond', clock_timestamp())`,
      })
      .where(eq(users.id, userId))
      .returning();
    return {
      changed: true,
      timezone: updated.timezone,
      timezoneMode: updated.timezoneMode,
      updatedAt: updated.updatedAt.toISOString(),
    };
  });
  if (result.changed)
    await invalidateUser(userId, ["analytics", "calendar", "subjects"]);
  return result;
}
