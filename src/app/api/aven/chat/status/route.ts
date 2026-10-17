import { z } from "zod";
import { learnerAccount, featureFailure, privateJson } from "@/lib/goals/http";
import { getGenerationStatus } from "@/lib/aven/conversations";
/**
 * Lightweight recovery endpoint: the durable state of the latest (or one) generation in a
 * conversation. Clients that lost their live stream (navigation, refresh, another tab,
 * a dropped network) poll this while a reply runs, instead of reloading the whole history.
 */
export async function GET(request: Request) {
  try {
    const user = await learnerAccount(),
      params = new URL(request.url).searchParams,
      input = z
        .object({ conversationId: z.uuid(), requestId: z.uuid().optional() })
        .parse({
          conversationId: params.get("conversationId"),
          requestId: params.get("requestId") ?? undefined,
        });
    return privateJson({
      ok: true,
      ...(await getGenerationStatus(user.id, input.conversationId, input.requestId)),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
