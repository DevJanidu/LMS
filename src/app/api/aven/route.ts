import { z } from "zod";
import {
  learnerAccount,
  privateJson,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import {
  avenBootstrap,
  getConversation,
  recoverRequestConversation,
  listConversations,
} from "@/lib/aven/conversations";
import { changeAvenPreferences } from "@/lib/aven/preferences";
import { preferenceMutationSchema } from "@/lib/aven/validation";
export async function GET(request: Request) {
  try {
    const user = await learnerAccount(),
      params = new URL(request.url).searchParams,
      id = params.get("conversation"),
      before = params.get("before"),
      search = params.get("q")?.trim();
    if (params.get("history") === "true")
      return privateJson({
        ok: true,
        ...(await listConversations(
          user.id,
          before ? z.uuid().parse(before) : undefined,
          search ? z.string().max(80).parse(search) : undefined,
        )),
      });
    if (params.get("request"))
      return privateJson({
        ok: true,
        ...(await recoverRequestConversation(
          user.id,
          z.uuid().parse(params.get("request")),
        )),
      });
    return privateJson({
      ok: true,
      ...(id
        ? await getConversation(
            user.id,
            z.uuid().parse(id),
            before ? z.uuid().parse(before) : undefined,
          )
        : await avenBootstrap(user.id)),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await learnerAccount();
    const input = await validatedBody(request, preferenceMutationSchema);
    return privateJson({
      ok: true,
      preferences: await changeAvenPreferences(user.id, input),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
