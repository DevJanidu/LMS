import { timerElapsed } from "@/lib/analytics";
import type { ActiveTimer } from "@/types";

/** Input is the persisted server timer, never the client timer payload. */
export function finishSnapshot(timer: ActiveTimer, now: number) {
  const durationSeconds = Math.floor(Math.min(timerElapsed(timer, now), timer.confirmedUntilSeconds));
  const endedAt = new Date(Math.min(timer.pausedAt ? Date.parse(timer.pausedAt) : now, Date.parse(timer.startedAt) + (timer.confirmedUntilSeconds + timer.pausedTotalSeconds) * 1000));
  return { durationSeconds, endedAt, saved: durationSeconds >= 60 };
}
