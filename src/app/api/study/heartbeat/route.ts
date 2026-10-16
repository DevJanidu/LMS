import { featureFailure, learnerAccount, privateJson } from "@/lib/goals/http";
import { GoalError } from "@/lib/goals/service";
import { getAccountEnv } from "@/lib/env";
import { requestLimit } from "@/lib/rate-limit";
import { recordHeartbeat } from "@/lib/circles/tracking";

/**
 * The running timer reports that its tab is open. The body is ignored: the
 * server clock decides everything, so a heartbeat can only extend a span that
 * the server itself opened.
 */
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(getAccountEnv().APP_URL).origin) throw new GoalError("invalidInput", 403);
    const user = await learnerAccount();
    // Expected once a minute; extra calls cannot add credit, so a tight limit is safe.
    const limit = await requestLimit(`heartbeat:${user.id}`, 6, 60);
    if (limit === "limited") throw new GoalError("tooManyRequests", 429);
    return privateJson({ ok: true, ...(await recordHeartbeat(user.id)) });
  } catch (error) {
    return featureFailure(error);
  }
}
