import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { synchronizeTimezone } from "@/lib/services/timezone";
import { validatedBody, featureFailure, privateJson } from "@/lib/goals/http";
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return privateJson({ ok: false, error: "authenticationFailed" }, 401);
    const input = await validatedBody(
      request,
      z.object({ timezone: z.string().trim().min(1).max(100) }),
    );
    return privateJson({
      ok: true,
      ...(await synchronizeTimezone(user.id, input.timezone)),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
