import { z } from "zod";
import {
  featureFailure,
  learnerAccount,
  privateJson,
  validatedBody,
} from "@/lib/goals/http";
import {
  getGoalDetail,
  goalReferences,
  listGoals,
  mutateGoal,
} from "@/lib/goals/service";
import { goalMutationSchema, goalStatuses } from "@/lib/goals/validation";
const querySchema = z.object({
  id: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  search: z.string().max(100).default(""),
  status: z.union([z.enum(goalStatuses), z.literal("")]).default(""),
  sort: z.enum(["deadline", "progress", "updated"]).default("deadline"),
});
export async function GET(request: Request) {
  try {
    const user = await learnerAccount();
    const params = new URL(request.url).searchParams;
    if (params.get("references") === "1")
      return privateJson({
        ok: true,
        references: await goalReferences(user.id),
      });
    const query = querySchema.parse(Object.fromEntries(params));
    return privateJson({
      ok: true,
      ...(query.id
        ? { detail: await getGoalDetail(user.id, query.id) }
        : await listGoals(
            user.id,
            query.page,
            query.search,
            query.status,
            query.sort,
          )),
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return privateJson({ ok: false, error: "invalidInput" }, 400);
    return featureFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await learnerAccount(),
      input = await validatedBody(request, goalMutationSchema);
    const result = await mutateGoal(user.id, input);
    return privateJson({
      ok: true,
      ...result,
      ...(result.deleted
        ? {}
        : {
            detail:
              result.detail ?? (await getGoalDetail(user.id, result.goalId)),
          }),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
