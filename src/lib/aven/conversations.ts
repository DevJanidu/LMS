import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError, getGoalDetail } from "@/lib/goals/service";
import { proposalList } from "./proposals";
import { z } from "zod";
import {
  MAX_MENTIONS,
  mentionReferenceSchema,
  type MentionReference,
} from "./commands";
import { getAvenPreferences } from "./preferences";
export async function listConversations(
  userId: string,
  before?: string,
  search?: string,
) {
  const pattern = search ? `%${search.replace(/[\\%_]/g, "\\$&")}%` : undefined;
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
        pattern ? sql`${s.aiConversations.title} ILIKE ${pattern}` : undefined,
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
  const page = messages.slice(0, 100).reverse();
  // Proactive messages keep an insert-time snapshot; merge the current outcome so resolved actions are not offered again.
  const notificationIds = page
    .map((message) => message.context?.notificationId)
    .filter((value): value is string => Boolean(value));
  const actions = notificationIds.length
    ? await getDb()
        .select({
          id: s.notificationActions.notificationId,
          value: s.notificationActions.value,
        })
        .from(s.notificationActions)
        .innerJoin(
          s.notifications,
          eq(s.notifications.id, s.notificationActions.notificationId),
        )
        .where(
          and(
            eq(s.notifications.userId, userId),
            inArray(s.notificationActions.notificationId, notificationIds),
          ),
        )
    : [];
  const resolved = new Map(
    actions.map((action) => [action.id, action.value.resolved]),
  );
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
    messages: page.map((message) => {
      const outcome = message.context?.notificationId
        ? resolved.get(message.context.notificationId)
        : undefined;
      return outcome
        ? { ...message, context: { ...message.context, resolved: outcome } }
        : message;
    }),
    proposals,
  };
}
export async function avenBootstrap(userId: string) {
  const [history, preferences, [goal]] = await Promise.all([
    listConversations(userId),
    getAvenPreferences(userId),
    getDb()
      .select({ id: s.goals.id })
      .from(s.goals)
      .where(eq(s.goals.userId, userId))
      .limit(1),
  ]);
  return JSON.parse(
    JSON.stringify({
      userId,
      ...history,
      preferences,
      hasGoals: Boolean(goal),
    }),
  ) as {
    userId: string;
    hasGoals: boolean;
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
/** The @ references saved with an earlier user message, re-validated on every use. */
export async function storedReferences(
  userId: string,
  conversationId: string,
  requestId: string,
): Promise<MentionReference[]> {
  const [row] = await getDb()
    .select({ context: s.aiMessages.context })
    .from(s.aiMessages)
    .innerJoin(s.aiConversations, eq(s.aiConversations.id, s.aiMessages.conversationId))
    .where(
      and(
        eq(s.aiConversations.userId, userId),
        eq(s.aiMessages.conversationId, conversationId),
        eq(s.aiMessages.requestId, requestId),
        eq(s.aiMessages.role, "user"),
      ),
    );
  try {
    const parsed = z
      .array(mentionReferenceSchema)
      .max(MAX_MENTIONS)
      .safeParse(JSON.parse(row?.context?.references ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
export async function beginConversationTurn(
  userId: string,
  conversationId: string | null,
  goalId: string | null,
  requestId: string,
  message: string,
  retryRequestId?: string | null,
  regenerate = false,
  references: MentionReference[] = [],
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
      if (regenerate) {
        // Only the latest exchange may be regenerated so history never branches.
        const [latest] = await tx
          .select({ requestId: s.aiMessages.requestId })
          .from(s.aiMessages)
          .where(
            and(
              eq(s.aiMessages.conversationId, id),
              eq(s.aiMessages.role, "user"),
            ),
          )
          .orderBy(desc(s.aiMessages.createdAt), desc(s.aiMessages.id))
          .limit(1);
        if (latest?.requestId !== retryRequestId)
          throw new GoalError("invalidInput");
      } else if (
        prior.some(
          (row) => row.role === "assistant" && row.status === "complete",
        )
      )
        throw new GoalError("alreadyAnswered", 409);
      const [answeredRetry] = regenerate
        ? []
        : await tx
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
        // Structured @ references survive retries, regeneration and reloads.
        ...(references.length
          ? { context: { references: JSON.stringify(references) } }
          : {}),
      });
    await tx
      .update(s.aiConversations)
      .set({
        activeRequestId: requestId,
        // Lease outlives the 110s request timeout so a live turn is never taken over.
        lockedUntil: new Date(Date.now() + 130000),
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
    // A regenerated reply must not see the answer it replaces.
    const replaced = (row: (typeof history)[number]) =>
      regenerate &&
      row.role === "assistant" &&
      (row.requestId === retryRequestId ||
        row.context?.replyTo === retryRequestId);
    return {
      id,
      goalId: conversation.goalId,
      summary: conversation.summary,
      summaryMessageCount: conversation.summaryMessageCount,
      messageCount: count,
      history: history.reverse().filter((row) => !replaced(row)),
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
  extraContext?: Record<string, string>,
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
        context:
          retrySource || extraContext
            ? {
                ...extraContext,
                ...(retrySource ? { replyTo: retrySource.requestId } : {}),
              }
            : null,
      })
      .onConflictDoNothing();
    // A completed retry or regeneration supersedes earlier replies to the same message.
    if (retrySource && status === "complete")
      await tx
        .update(s.aiMessages)
        .set({ status: "superseded" })
        .where(
          and(
            eq(s.aiMessages.conversationId, id),
            eq(s.aiMessages.role, "assistant"),
            eq(s.aiMessages.status, "complete"),
            sql`${s.aiMessages.requestId} <> ${requestId}::uuid`,
            sql`(${s.aiMessages.requestId} = ${retrySource.requestId}::uuid OR ${s.aiMessages.context}->>'replyTo' = ${retrySource.requestId})`,
          ),
        );
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
/** Replace the stop placeholder with the partial reply the server streamed before cancellation. */
export async function keepStoppedAnswer(
  userId: string,
  id: string,
  requestId: string,
  content: string,
) {
  await getDb()
    .update(s.aiMessages)
    .set({ content })
    .where(
      and(
        eq(s.aiMessages.conversationId, id),
        eq(s.aiMessages.requestId, requestId),
        eq(s.aiMessages.role, "assistant"),
        eq(s.aiMessages.status, "cancelled"),
        eq(s.aiMessages.content, "generationStopped"),
        sql`EXISTS (SELECT 1 FROM ai_conversations c WHERE c.id = ${id}::uuid AND c.user_id = ${userId}::uuid)`,
      ),
    );
}
