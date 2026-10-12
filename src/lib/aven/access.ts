import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, aiUserPreferences, aiConversations } from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import { assertEntitlement } from "@/lib/billing/entitlements";
export async function assertAvenAccess(userId: string) {
  const [record] = await getDb()
    .select({
      status: users.status,
      role: users.role,
      preferences: aiUserPreferences.value,
    })
    .from(users)
    .leftJoin(aiUserPreferences, eq(aiUserPreferences.userId, users.id))
    .where(and(eq(users.id, userId), eq(users.status, "active")));
  if (!record || record.role !== "learner")
    throw new GoalError("authenticationFailed", 403);
  await assertEntitlement(userId, "aven");
  if (!record.preferences?.consent)
    throw new GoalError("aiConsentRequired", 403);
}
export async function assertConversationActive(
  userId: string,
  id: string,
  requestId: string,
) {
  const [lease] = await getDb()
    .select({ activeRequestId: aiConversations.activeRequestId })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
  if (!lease || lease.activeRequestId !== requestId)
    throw new GoalError("generationStopped", 409);
}
export async function assertResourceAccess(userId: string) {
  await assertAvenAccess(userId);
  const [row] = await getDb()
    .select({ value: aiUserPreferences.value })
    .from(aiUserPreferences)
    .where(eq(aiUserPreferences.userId, userId));
  if (!row?.value.allowResourceContent)
    throw new GoalError("resourceConsentRequired", 403);
}
