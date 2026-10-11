import { z } from "zod";
import {
  learnerAccount,
  privateJson,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import { proposalList, resolveProposal } from "@/lib/aven/proposals";
export async function GET() {
  try {
    const user = await learnerAccount();
    return privateJson({ ok: true, proposals: await proposalList(user.id) });
  } catch (error) {
    return featureFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await learnerAccount(),
      input = await validatedBody(
        request,
        z.object({ id: z.uuid(), decision: z.enum(["approve", "reject"]) }),
      );
    return privateJson({
      ok: true,
      ...(await resolveProposal(user.id, input.id, input.decision)),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
