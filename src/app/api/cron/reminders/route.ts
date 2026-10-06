import { runCron } from "@/lib/cron";
import { generateReminders } from "@/lib/services/jobs";
export const maxDuration = 60;
export async function GET(request: Request) { return runCron(request, generateReminders); }
