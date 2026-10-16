import { runCron } from "@/lib/cron";
import { finalizeReadyWeeks } from "@/lib/circles/competition";
export const maxDuration = 60;
/** Daily: finalizes Study Circles weeks that ended at least a day ago (idempotent). */
export async function GET(request: Request) { return runCron(request, () => finalizeReadyWeeks()); }
