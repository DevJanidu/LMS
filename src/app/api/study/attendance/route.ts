import { z } from "zod";
import {
  learnerAccount,
  privateJson,
  validatedBody,
  featureFailure,
} from "@/lib/goals/http";
import { attendanceList, reportAttendance } from "@/lib/study/attendance";
export async function GET() {
  try {
    const user = await learnerAccount();
    return privateJson({ ok: true, attendance: await attendanceList(user.id) });
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
          blockId: z.uuid(),
          date: z.iso.date(),
          expectedStartsAt: z.iso.datetime(),
          status: z.enum(["attended", "skipped"]),
        }),
      );
    return privateJson({
      ok: true,
      ...(await reportAttendance(user.id, input, input.status)),
    });
  } catch (error) {
    return featureFailure(error);
  }
}
