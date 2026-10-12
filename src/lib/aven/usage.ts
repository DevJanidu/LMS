import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { budgetFailure } from "./budget";
import { GoalError } from "@/lib/goals/service";
import {
  avenConfig,
  MAX_INPUT_BYTES,
  MAX_INSTRUCTION_BYTES,
  MAX_TOOL_ROUNDS,
} from "./config";
export async function reserveUsage(
  userId: string,
  requestId: string,
  planning: boolean,
  schemaBytes = 20000,
  measuredInputTokens?: number,
) {
  const config = avenConfig(planning),
    inputBound =
      measuredInputTokens ??
      MAX_INPUT_BYTES + schemaBytes + MAX_INSTRUCTION_BYTES,
    rounds = measuredInputTokens === undefined ? MAX_TOOL_ROUNDS : 1,
    tokens = rounds * (inputBound + config.maxOutputTokens),
    costMicros = Math.ceil(
      rounds *
        (inputBound * config.inputPrice +
          config.maxOutputTokens * config.outputPrice),
    );
  return getDb().transaction(async (tx) => {
    // Global lock precedes account locks so concurrent learners cannot overspend the shared cap.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('aven-global-budget'))`,
    );
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`aven-usage:${userId}`}))`,
    );
    const existing = await tx
      .select()
      .from(s.aiUsageRecords)
      .where(
        sql`${s.aiUsageRecords.userId}=${userId}::uuid AND ${s.aiUsageRecords.requestId}=${requestId}::uuid`,
      );
    if (existing.length) throw new GoalError("duplicateRequest", 409);
    const usage = await tx.execute<{
      dayCost: number;
      monthCost: number;
      dayTokens: number;
      monthTokens: number;
      recent: number;
    }>(
      sql`SELECT coalesce(sum(cost_micros) FILTER(WHERE day=current_date),0)::int AS "dayCost", coalesce(sum(cost_micros),0)::int AS "monthCost", coalesce(sum(CASE WHEN status='reserved' THEN reserved_tokens ELSE input_tokens+output_tokens END) FILTER(WHERE day=current_date),0)::int AS "dayTokens", coalesce(sum(CASE WHEN status='reserved' THEN reserved_tokens ELSE input_tokens+output_tokens END),0)::int AS "monthTokens", count(*) FILTER(WHERE created_at>now()-interval '1 minute')::int AS recent FROM ai_usage_records WHERE user_id=${userId}::uuid AND day>=date_trunc('month',now())::date`,
    );
    const row = usage.rows[0];
    const global = await tx.execute<{ cost: number }>(
      sql`SELECT coalesce(sum(cost_micros),0)::bigint AS cost FROM ai_usage_records WHERE day>=date_trunc('month',now())::date`,
    );
    if (row.recent >= 5) throw new GoalError("rateLimited", 429);
    const failure = budgetFailure(
      { ...row, globalCost: Number(global.rows[0].cost) },
      costMicros,
      tokens,
      config,
    );
    if (failure) throw new GoalError(failure, 429);
    const [reservation] = await tx
      .insert(s.aiUsageRecords)
      .values({
        userId,
        requestId,
        model: config.model,
        day: new Date().toISOString().slice(0, 10),
        reservedTokens: tokens,
        costMicros,
      })
      .returning({ id: s.aiUsageRecords.id });
    return { id: reservation.id, config };
  });
}
export async function finishUsage(
  id: string,
  inputTokens: number,
  outputTokens: number,
  planning: boolean,
  uncertain = false,
) {
  const config = avenConfig(planning);
  // Unknown upstream usage keeps the conservative reservation charged.
  await getDb()
    .update(s.aiUsageRecords)
    .set({
      inputTokens,
      outputTokens,
      ...(uncertain
        ? {}
        : {
            status: "complete",
            costMicros: Math.ceil(
              inputTokens * config.inputPrice +
                outputTokens * config.outputPrice,
            ),
          }),
    })
    .where(eq(s.aiUsageRecords.id, id));
}
