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
/**
 * assertAvenAccess and assertConversationActive in one query: account active, learner,
 * AI consent, entitlement, and this request still holding the conversation lease. Runs
 * before model rounds and tool calls, so it is one round trip instead of two.
 */
export async function assertTurnActive(userId: string, id: string, requestId: string) {
  const [[record]] = await Promise.all([
    getDb()
      .select({
        role: users.role,
        preferences: aiUserPreferences.value,
        activeRequestId: aiConversations.activeRequestId,
      })
      .from(users)
      .leftJoin(aiUserPreferences, eq(aiUserPreferences.userId, users.id))
      .leftJoin(aiConversations, and(eq(aiConversations.id, id), eq(aiConversations.userId, users.id)))
      .where(and(eq(users.id, userId), eq(users.status, "active"))),
    assertEntitlement(userId, "aven"),
  ]);
  if (!record || record.role !== "learner") throw new GoalError("authenticationFailed", 403);
  if (!record.preferences?.consent) throw new GoalError("aiConsentRequired", 403);
  if (record.activeRequestId !== requestId) throw new GoalError("generationStopped", 409);
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
