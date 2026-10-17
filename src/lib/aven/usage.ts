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
import type { ModelChoice } from "./models";
export interface ReserveOptions {
  /** The student's resolved model settings; their model, effort and prices apply. */
  choice?: ModelChoice;
  /** The plan's monthly AI allowance (USD), enforced when billing is on. */
  planBudgetUsd?: number | null;
}
export async function reserveUsage(
  userId: string,
  requestId: string,
  planning: boolean,
  schemaBytes = 20000,
  measuredInputTokens?: number,
  options: ReserveOptions = {},
) {
  const base = avenConfig(planning, options.choice);
  // A plan allowance can only lower the operator's per-account cap, never raise it.
  const config =
    typeof options.planBudgetUsd === "number"
      ? { ...base, monthlyBudget: Math.min(base.monthlyBudget, options.planBudgetUsd) }
      : base,
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
  // Three statements inside the transaction (was six): every round trip to the database is
  // paid before the student sees a word, so the checks are combined, not removed.
  return getDb().transaction(async (tx) => {
    // Global lock precedes the account lock (scalar subqueries run in order) so concurrent
    // learners cannot overspend the shared cap.
    await tx.execute(
      sql`SELECT (SELECT pg_advisory_xact_lock(hashtext('aven-global-budget'))) AS global, (SELECT pg_advisory_xact_lock(hashtext(${`aven-usage:${userId}`}))) AS account`,
    );
    const usage = await tx.execute<{
      duplicate: boolean;
      dayCost: number;
      monthCost: number;
      dayTokens: number;
      monthTokens: number;
      recent: number;
      globalCost: number;
    }>(
      sql`SELECT EXISTS(SELECT 1 FROM ai_usage_records WHERE user_id=${userId}::uuid AND request_id=${requestId}::uuid) AS duplicate, coalesce(sum(cost_micros) FILTER(WHERE day=current_date),0)::int AS "dayCost", coalesce(sum(cost_micros),0)::int AS "monthCost", coalesce(sum(CASE WHEN status='reserved' THEN reserved_tokens ELSE input_tokens+output_tokens END) FILTER(WHERE day=current_date),0)::int AS "dayTokens", coalesce(sum(CASE WHEN status='reserved' THEN reserved_tokens ELSE input_tokens+output_tokens END),0)::int AS "monthTokens", count(*) FILTER(WHERE created_at>now()-interval '1 minute')::int AS recent, (SELECT coalesce(sum(cost_micros),0) FROM ai_usage_records WHERE day>=date_trunc('month',now())::date)::bigint AS "globalCost" FROM ai_usage_records WHERE user_id=${userId}::uuid AND day>=date_trunc('month',now())::date`,
    );
    const row = usage.rows[0];
    if (row.duplicate) throw new GoalError("duplicateRequest", 409);
    if (row.recent >= 5) throw new GoalError("rateLimited", 429);
    const failure = budgetFailure(
      { ...row, globalCost: Number(row.globalCost) },
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
/** Actual cost in micro-USD; cached input tokens are billed at the cached price. */
export function usageCostMicros(
  config: { inputPrice: number; cachedInputPrice?: number; outputPrice: number },
  inputTokens: number,
  outputTokens: number,
  cachedTokens = 0,
) {
  const cached = Math.max(0, Math.min(cachedTokens, inputTokens));
  return Math.ceil(
    (inputTokens - cached) * config.inputPrice +
      cached * (config.cachedInputPrice ?? config.inputPrice) +
      outputTokens * config.outputPrice,
  );
}
export async function finishUsage(
  id: string,
  inputTokens: number,
  outputTokens: number,
  planning: boolean,
  uncertain = false,
  /** The reservation's own config (model and prices) and the cached input tokens. */
  options: { config?: ReturnType<typeof avenConfig>; cachedTokens?: number } = {},
) {
  const config = options.config ?? avenConfig(planning);
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
            costMicros: usageCostMicros(config, inputTokens, outputTokens, options.cachedTokens),
          }),
    })
    .where(eq(s.aiUsageRecords.id, id));
}
