import { z } from "zod";
import { featureFailure, learnerAccount, privateJson } from "@/lib/goals/http";
import { GoalError } from "@/lib/goals/service";
import { requestLimit } from "@/lib/rate-limit";
import { mentionTypes } from "@/lib/aven/commands";
import { searchMentions } from "@/lib/aven/mentions";
/** Mention autocomplete: account-scoped database search only; never calls the model or uses credits. */
const querySchema = z.object({
  q: z.string().max(100).default(""),
  offset: z.coerce.number().int().min(0).max(32).default(0),
  types: z
    .string()
    .max(200)
    .default("")
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.enum(mentionTypes)).max(mentionTypes.length)),
});
export async function GET(request: Request) {
  try {
    const user = await learnerAccount();
    const query = querySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new GoalError("invalidInput");
    const decision = await requestLimit(`aven-mentions:${user.id}`, 90, 60);
    if (decision !== "allowed")
      throw new GoalError(
        decision === "limited" ? "tooManyRequests" : "serviceUnavailable",
        decision === "limited" ? 429 : 503,
      );
    return privateJson({
      ok: true,
      ...(await searchMentions(user.id, query.data.q, {
        types: query.data.types,
        offset: query.data.offset,
      })),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
