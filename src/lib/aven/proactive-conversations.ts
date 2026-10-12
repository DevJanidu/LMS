import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, type DbTransaction } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
export async function appendProactiveMessage(
  tx: DbTransaction,
  userId: string,
  notification: typeof s.notifications.$inferSelect,
  context: (typeof s.notificationActions.$inferInsert)["value"],
  title: string,
) {
  let [conversation] = await tx
    .select()
    .from(s.aiConversations)
    .where(
      and(
        eq(s.aiConversations.userId, userId),
        eq(s.aiConversations.sourceKey, "companion"),
      ),
    );
  if (!conversation) {
    [conversation] = await tx
      .insert(s.aiConversations)
      .values({ userId, title, sourceKey: "companion" })
      .onConflictDoUpdate({
        target: [s.aiConversations.userId, s.aiConversations.sourceKey],
        set: { updatedAt: new Date() },
      })
      .returning();
  }
  const snapshot = Object.fromEntries(
    Object.entries({ ...context, notificationId: notification.id }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  await tx
    .insert(s.aiMessages)
    .values({
      conversationId: conversation.id,
      requestId: notification.id,
      role: "assistant",
      content: notification.body,
      status: "complete",
      context: snapshot,
      createdAt: notification.createdAt,
    })
    .onConflictDoNothing();
  await tx
    .update(s.aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(s.aiConversations.id, conversation.id));
  return conversation.id;
}
export async function notificationConversation(userId: string, id: string) {
  return getDb().transaction(async (tx) => {
    const [actor] = await tx
      .select()
      .from(s.users)
      .where(eq(s.users.id, userId))
      .for("update");
    if (actor?.status !== "active" || actor.role !== "learner")
      throw new GoalError("authenticationFailed", 403);
    const [notification] = await tx
      .select()
      .from(s.notifications)
      .where(
        and(
          eq(s.notifications.id, id),
          eq(s.notifications.userId, userId),
          eq(s.notifications.type, "aven"),
        ),
      )
      .for("update");
    if (!notification) throw new GoalError("recordUnavailable", 404);
    const [action] = await tx
      .select()
      .from(s.notificationActions)
      .where(eq(s.notificationActions.notificationId, id));
    const value = action?.value ?? { kind: "checkIn" };
    const conversationId = await appendProactiveMessage(
      tx,
      userId,
      notification,
      value,
      notification.title,
    );
    await tx
      .insert(s.notificationActions)
      .values({ notificationId: id, value: { ...value, conversationId } })
      .onConflictDoUpdate({
        target: s.notificationActions.notificationId,
        set: { value: { ...value, conversationId } },
      });
    await tx
      .update(s.notifications)
      .set({ readAt: new Date() })
      .where(eq(s.notifications.id, id));
    return { conversationId };
  });
}
