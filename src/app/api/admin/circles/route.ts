import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { featureFailure, privateJson, validatedBody } from "@/lib/goals/http";
import { GoalError } from "@/lib/goals/service";
import { correctInterval, reconcileWeeklyScores } from "@/lib/circles/competition";

const input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("correct"), intervalId: z.uuid(), action: z.enum(["invalidate", "restore"]), reason: z.string().trim().min(3).max(500) }),
  z.object({ kind: z.literal("reconcile"), userId: z.uuid() }),
]);

/** Platform administrators only: audited score corrections and ledger reconciliation. */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new GoalError("authenticationFailed", 401);
    if (user.role !== "super_admin") throw new GoalError("recordUnavailable", 403);
    const body = await validatedBody(request, input);
    const result = body.kind === "correct" ? await correctInterval(user.id, body.intervalId, body.action, body.reason) : await reconcileWeeklyScores(body.userId);
    return privateJson({ ok: true, ...result });
  } catch (error) {
    return featureFailure(error);
  }
}
