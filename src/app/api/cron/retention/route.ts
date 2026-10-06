import { runCron } from "@/lib/cron";
import { retainData } from "@/lib/services/jobs";
export async function GET(request: Request) { return runCron(request, retainData); }
