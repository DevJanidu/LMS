import { z } from "zod";
import {
  learnerAccount,
  validatedBody,
  featureFailure,
  privateJson,
} from "@/lib/goals/http";
import { finishConversationTurn } from "@/lib/aven/conversations";
export async function POST(request: Request) {
  try {
    const user = await learnerAccount();
    const input = await validatedBody(
      request,
      z.object({ conversationId: z.uuid(), requestId: z.uuid() }),
    );
    const stopped = await finishConversationTurn(
      user.id,
      input.conversationId,
      input.requestId,
      "generationStopped",
      "cancelled",
    );
    return privateJson({ ok: true, stopped });
  } catch (error) {
    return featureFailure(error);
  }
}
