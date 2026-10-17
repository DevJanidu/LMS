import {
  learnerAccount,
  validatedBody,
  featureFailure,
  privateJson,
} from "@/lib/goals/http";
import { GoalError } from "@/lib/goals/service";
import { requestLimit } from "@/lib/rate-limit";
import {
  componentActionSchema,
  performComponentAction,
} from "@/lib/aven/component-state";
/**
 * Interactions with Aven's interactive blocks: saving checklist, flashcard and target
 * state, grading quiz answers, saving a checklist as a goal proposal and re-planning a
 * study plan. Authenticated, same-origin, rate-limited and ownership-checked; none of it
 * calls the model.
 */
export async function POST(request: Request) {
  try {
    const user = await learnerAccount();
    const decision = await requestLimit(`aven-components:${user.id}`, 120, 60);
    if (decision !== "allowed")
      throw new GoalError(decision === "limited" ? "rateLimited" : "serviceUnavailable", decision === "limited" ? 429 : 503);
    const action = await validatedBody(request, componentActionSchema);
    return privateJson(await performComponentAction(user.id, action));
  } catch (error) {
    return featureFailure(error);
  }
}
