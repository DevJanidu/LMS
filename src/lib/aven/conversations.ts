import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError, getGoalDetail } from "@/lib/goals/service";
import { proposalList } from "./proposals";
import { getAvenPreferences } from "./preferences";
export async function listConversations(userId: string, before?: string) {
  const [cursor] = before
    ? await getDb()
        .select()
        .from(s.aiConversations)
        .where(
          and(
            eq(s.aiConversations.id, before),
            eq(s.aiConversations.userId, userId),
          ),
        )
    : [];
  if (before && !cursor) throw new GoalError("recordUnavailable", 404);
  const rows = await getDb()
    .select({
      id: s.aiConversations.id,
      title: s.aiConversations.title,
      goalId: s.aiConversations.goalId,
      updatedAt: s.aiConversations.updatedAt,
    })
    .from(s.aiConversations)
    .where(
      and(
        eq(s.aiConversations.userId, userId),
        cursor
          ? sql`(${s.aiConversations.updatedAt},${s.aiConversations.id}) < (SELECT updated_at,id FROM ai_conversations WHERE id=${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(s.aiConversations.updatedAt), desc(s.aiConversations.id))
    .limit(51);
  return {
    conversations: rows.slice(0, 50),
    hasMoreConversations: rows.length > 50,
  };
}
export async function getConversation(
  userId: string,
  id: string,
  before?: string,
) {
  const [conversation] = await getDb()
    .select()
    .from(s.aiConversations)
    .where(
      and(eq(s.aiConversations.id, id), eq(s.aiConversations.userId, userId)),
    );
  if (!conversation) throw new GoalError("recordUnavailable", 404);
  const [cursor] = before
    ? await getDb()
        .select()
        .from(s.aiMessages)
        .where(
          and(eq(s.aiMessages.id, before), eq(s.aiMessages.conversationId, id)),
        )
    : [];
  if (before && !cursor) throw new GoalError("recordUnavailable", 404);
  const [messages, proposals] = await Promise.all([
    getDb()
      .select()
      .from(s.aiMessages)
      .where(
        and(
          eq(s.aiMessages.conversationId, id),
          cursor
            ? sql`(${s.aiMessages.createdAt}, ${s.aiMessages.id}) < (SELECT created_at, id FROM ai_messages WHERE id=${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .orderBy(desc(s.aiMessages.createdAt), desc(s.aiMessages.id))
      .limit(101),
    proposalList(userId, id),
  ]);
  const [goal] = conversation.goalId
    ? await getDb()
        .select({ title: s.goals.title })
        .from(s.goals)
        .where(
          and(eq(s.goals.id, conversation.goalId), eq(s.goals.userId, userId)),
        )
    : [];
  return {
    conversation: { ...conversation, goalTitle: goal?.title ?? null },
    hasOlder: messages.length > 100,
    messages: messages.slice(0, 100).reverse(),
    proposals,
  };
}
export async function avenBootstrap(userId: string) {
  const [history, preferences] = await Promise.all([
    listConversations(userId),
    getAvenPreferences(userId),
  ]);
  return JSON.parse(JSON.stringify({ userId, ...history, preferences })) as {
    userId: string;
    hasMoreConversations: boolean;
    conversations: {
      id: string;
      title: string;
      goalId: string | null;
      updatedAt: string;
    }[];
    preferences: Awaited<ReturnType<typeof getAvenPreferences>>;
  };
}
export async function recoverRequestConversation(
  userId: string,
  requestId: string,
) {
  const [message] = await getDb()
    .select({ conversationId: s.aiMessages.conversationId })
    .from(s.aiMessages)
    .innerJoin(
      s.aiConversations,
      eq(s.aiConversations.id, s.aiMessages.conversationId),
    )
    .where(
      and(
        eq(s.aiConversations.userId, userId),
        eq(s.aiMessages.requestId, requestId),
        eq(s.aiMessages.role, "user"),
      ),
    )
    .limit(1);
  return message
    ? {
        found: true,
        ...(await getConversation(userId, message.conversationId)),
      }
    : { found: false };
}
export async function beginConversationTurn(
  userId: string,
  conversationId: string | null,
  goalId: string | null,
  requestId: string,
  message: string,
  retryRequestId?: string | null,
) {
  if (goalId) await getGoalDetail(userId, goalId);
  return getDb().transaction(async (tx) => {
    const id = conversationId ?? crypto.randomUUID();
    if (!conversationId)
      await tx
        .insert(s.aiConversations)
        .values({ id, userId, goalId, title: message.slice(0, 80) });
    const [conversation] = await tx
      .select()
      .from(s.aiConversations)
      .where(
        and(eq(s.aiConversations.id, id), eq(s.aiConversations.userId, userId)),
      )
      .for("update");
    if (!conversation) throw new GoalError("recordUnavailable", 404);
    if (
      conversation.lockedUntil &&
      conversation.lockedUntil.getTime() > Date.now()
    )
      throw new GoalError("conversationBusy", 409);
    if (conversation.goalId !== goalId) throw new GoalError("invalidInput");
    const existing = await tx
      .select()
      .from(s.aiMessages)
      .where(
        and(
          eq(s.aiMessages.conversationId, id),
          eq(s.aiMessages.requestId, requestId),
        ),
      );
    if (existing.length) throw new GoalError("duplicateRequest", 409);
    if (
      conversation.activeRequestId &&
      conversation.lockedUntil &&
      conversation.lockedUntil.getTime() <= Date.now()
    ) {
      await tx
        .insert(s.aiMessages)
        .values({
          conversationId: id,
          requestId: conversation.activeRequestId,
          role: "assistant",
          content: "generationInterrupted",
          status: "error",
        })
        .onConflictDoNothing();
    }
    if (retryRequestId) {
      const prior = await tx
        .select()
        .from(s.aiMessages)
        .where(
          and(
            eq(s.aiMessages.conversationId, id),
            eq(s.aiMessages.requestId, retryRequestId),
          ),
        );
      if (!prior.some((row) => row.role === "user" && row.content === message))
        throw new GoalError("invalidInput");
      if (
        prior.some(
          (row) => row.role === "assistant" && row.status === "complete",
        )
      )
        throw new GoalError("alreadyAnswered", 409);
      const [answeredRetry] = await tx
        .select({ id: s.aiMessages.id })
        .from(s.aiMessages)
        .where(
          and(
            eq(s.aiMessages.conversationId, id),
            eq(s.aiMessages.role, "assistant"),
            eq(s.aiMessages.status, "complete"),
            sql`${s.aiMessages.context}->>'replyTo' = ${retryRequestId}`,
          ),
        )
        .limit(1);
      if (answeredRetry) throw new GoalError("alreadyAnswered", 409);
      const original = prior.find((row) => row.role === "user")!;
      await tx
        .update(s.aiMessages)
        .set({ context: { ...original.context, latestRetryId: requestId } })
        .where(eq(s.aiMessages.id, original.id));
    } else
      await tx.insert(s.aiMessages).values({
        conversationId: id,
        requestId,
        role: "user",
        content: message,
      });
    await tx
      .update(s.aiConversations)
      .set({
        activeRequestId: requestId,
        lockedUntil: new Date(Date.now() + 100000),
        updatedAt: new Date(),
      })
      .where(eq(s.aiConversations.id, id));
    const history = await tx
      .select()
      .from(s.aiMessages)
      .where(eq(s.aiMessages.conversationId, id))
      .orderBy(desc(s.aiMessages.createdAt), desc(s.aiMessages.id))
      .limit(12);
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(s.aiMessages)
      .where(eq(s.aiMessages.conversationId, id));
    return {
      id,
      goalId: conversation.goalId,
      summary: conversation.summary,
      summaryMessageCount: conversation.summaryMessageCount,
      messageCount: count,
      history: history.reverse(),
    };
  });
}
export async function finishConversationTurn(
  userId: string,
  id: string,
  requestId: string,
  content: string,
  status: "complete" | "error" | "cancelled",
  summary?: string,
  summaryCount?: number,
) {
  return getDb().transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(s.aiConversations)
      .where(
        and(eq(s.aiConversations.id, id), eq(s.aiConversations.userId, userId)),
      )
      .for("update");
    if (!conversation || conversation.activeRequestId !== requestId)
      return false;
    const [retrySource] = await tx
      .select({ requestId: s.aiMessages.requestId })
      .from(s.aiMessages)
      .where(
        and(
          eq(s.aiMessages.conversationId, id),
          eq(s.aiMessages.role, "user"),
          sql`${s.aiMessages.context}->>'latestRetryId' = ${requestId}`,
        ),
      )
      .limit(1);
    await tx
      .insert(s.aiMessages)
      .values({
        conversationId: id,
        requestId,
        role: "assistant",
        content,
        status,
        context: retrySource ? { replyTo: retrySource.requestId } : null,
      })
      .onConflictDoNothing();
    await tx
      .update(s.aiConversations)
      .set({
        activeRequestId: null,
        lockedUntil: null,
        updatedAt: new Date(),
        ...(summary
          ? {
              summary,
              summaryMessageCount:
                summaryCount ?? conversation.summaryMessageCount,
            }
          : {}),
      })
      .where(eq(s.aiConversations.id, id));
    return true;
  });
}
