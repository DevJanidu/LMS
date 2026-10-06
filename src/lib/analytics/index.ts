import type { ActiveTimer, StudySession, Topic } from "../../types/index";

/** Topic completion is independent of time spent studying. */
export function subjectProgress(topics: readonly Topic[]): number {
  const active = topics.filter((topic) => !topic.archived);
  return active.length ? Math.round(active.filter((topic) => topic.status === "completed").length / active.length * 100) : 0;
}
export function weeklyGoalPercent(minutes: number, target: number): number {
  return target > 0 ? Math.min(100, Math.max(0, Math.round(minutes / target * 100))) : 0;
}
export function timerElapsed(timer: ActiveTimer, now: number): number {
  const end = timer.pausedAt ? Date.parse(timer.pausedAt) : now;
  return Math.max(0, Math.floor((end - Date.parse(timer.startedAt)) / 1000 - timer.pausedTotalSeconds));
}
export function localDay(instant: string | number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function shiftDay(day: string, count: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
/** Convert a wall-clock input into UTC, including non-hour offsets and DST. */
export function zonedToUtc(wallTime: string, timezone: string): string {
  const target = Date.parse(`${wallTime}:00Z`);
  let candidate = target;
  for (let index = 0; index < 4; index++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(candidate);
    const p = (type: string) => parts.find((part) => part.type === type)?.value;
    const represented = Date.parse(`${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}Z`);
    const correction = target - represented;
    candidate += correction;
    if (!correction) break;
  }
  if (!Number.isFinite(candidate)) throw new Error("Invalid date");
  return new Date(candidate).toISOString();
}
export function wallTime(instant: string, timezone: string): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
  return `${localDay(instant, timezone)}T${time}`;
}
/** Split valid study time at local midnight so late sessions count on both days. */
export function dailySeconds(sessions: readonly StudySession[], timezone: string): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const session of sessions) {
    if (session.status !== "valid" || session.durationSeconds < 60) continue;
    let cursor = Date.parse(session.startedAt);
    const end = Date.parse(session.endedAt);
    const span = (end - cursor) / 1000;
    if (span <= 0 || !Number.isFinite(span)) continue;
    while (cursor < end) {
      const day = localDay(cursor, timezone);
      const midnight = Date.parse(zonedToUtc(`${shiftDay(day, 1)}T00:00`, timezone));
      const next = Math.min(end, midnight);
      if (next <= cursor) break;
      totals[day] = (totals[day] ?? 0) + (next - cursor) / 1000 * Math.min(1, session.durationSeconds / span);
      cursor = next;
    }
  }
  return totals;
}
export function streaks(sessions: readonly StudySession[], timezone: string, now: number, thresholdMinutes = 10, historicalLongest = 0): { current: number; longest: number } {
  const totals = dailySeconds(sessions, timezone);
  const today = localDay(now, timezone);
  const days = Object.keys(totals).filter((day) => day <= today && totals[day] >= thresholdMinutes * 60).sort();
  let run = 0; let longest = historicalLongest; let previous = "";
  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run); previous = day;
  }
  let cursor = totals[today] >= thresholdMinutes * 60 ? today : shiftDay(today, -1);
  let current = 0;
  while (totals[cursor] >= thresholdMinutes * 60) { current++; cursor = shiftDay(cursor, -1); }
  return { current, longest };
}
export function weekStart(day: string, firstDay: 0 | 1): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -((weekday - firstDay + 7) % 7));
}
export function periodSeconds(sessions: readonly StudySession[], timezone: string, start: string, end: string): number {
  return Object.entries(dailySeconds(sessions, timezone)).filter(([day]) => day >= start && day <= end).reduce((sum, [, seconds]) => sum + seconds, 0);
}
export function totalSeconds(sessions: readonly StudySession[]): number {
  return sessions.filter((session) => session.status === "valid" && session.durationSeconds >= 60).reduce((sum, session) => sum + session.durationSeconds, 0);
}
