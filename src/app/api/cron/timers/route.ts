import { runCron } from "@/lib/cron";
import { sweepTimers } from "@/lib/services/jobs";
export async function GET(request: Request) { return runCron(request, sweepTimers); }
