import { z } from "zod";
import {
  learnerAccount,
  privateJson,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import {
  listAvenNotifications,
  notificationAction,
} from "@/lib/aven/notifications";
import { notificationConversation } from "@/lib/aven/proactive-conversations";
export async function GET(request: Request) {
  try {
    const user = await learnerAccount(),
      page = z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(new URL(request.url).searchParams.get("page") ?? 1);
    return privateJson({
      ok: true,
      ...(await listAvenNotifications(user.id, page)),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await learnerAccount(),
      input = await validatedBody(
        request,
        z.object({
          id: z.uuid(),
          kind: z.enum(["read", "skip", "reschedule", "reply", "snooze"]),
          startsAt: z.iso.datetime().optional(),
          endsAt: z.iso.datetime().optional(),
        }),
      );
    return privateJson({
      ok: true,
      ...(input.kind === "reply"
        ? await notificationConversation(user.id, input.id)
        : await notificationAction(
            user.id,
            input.id,
            input.kind,
            input.startsAt,
            input.endsAt,
          )),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
