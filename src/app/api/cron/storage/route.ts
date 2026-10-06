import { runCron } from "@/lib/cron";
import { cleanupStorage } from "@/lib/services/jobs";
export const maxDuration = 60;
export async function GET(request: Request) { return runCron(request, cleanupStorage); }
