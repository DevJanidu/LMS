import { localDay, wallTime, zonedToUtc } from "@/lib/analytics";
import type { NotificationPreferences } from "./validation";
const minutes = (clock: string) =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
export function inQuietHours(clock: string, start: string, end: string) {
  const value = minutes(clock),
    from = minutes(start),
    to = minutes(end);
  return from === to
    ? false
    : from < to
      ? value >= from && value < to
      : value >= from || value < to;
}
export function mayNotify(
  preferences: NotificationPreferences,
  now: number,
  timezone: string,
  todayCount: number,
) {
  return (
    preferences.enabled &&
    (!preferences.snoozedUntil ||
      Date.parse(preferences.snoozedUntil) <= now) &&
    todayCount < preferences.dailyLimit &&
    !inQuietHours(
      wallTime(new Date(now).toISOString(), timezone).slice(11, 16),
      preferences.quietStart,
      preferences.quietEnd,
    )
  );
}
export function randomCheckInTime(
  userId: string,
  date: string,
  start: string,
  end: string,
) {
  let hash = 2166136261;
  for (const char of `${userId}:${date}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const value =
    minutes(start) +
    ((hash >>> 0) % Math.max(1, minutes(end) - minutes(start)));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
export interface StudyEvidence {
  subjectId: string | null;
  startedAt: Date | string;
  endedAt?: Date | string;
  status?: string;
}
export function missedStart(
  startsAt: string,
  endsAt: string,
  subjectId: string | undefined,
  evidence: StudyEvidence[],
  timer: StudyEvidence | undefined,
  now: number,
  graceMinutes: number,
) {
  const start = Date.parse(startsAt),
    end = Date.parse(endsAt);
  if (now < start + graceMinutes * 60000 || now > end + 3600000) return false;
  const matches = (row: StudyEvidence) =>
    Boolean(subjectId) &&
    row.subjectId === subjectId &&
    (row.status === undefined || row.status === "valid") &&
    new Date(row.startedAt).getTime() >= start - 15 * 60000 &&
    new Date(row.startedAt).getTime() < end;
  return !evidence.some(matches) && !(timer && matches(timer));
}
export function dueLocalTime(
  now: number,
  timezone: string,
  clock: string,
  catchupMinutes = 60,
) {
  const day = localDay(now, timezone),
    due = Date.parse(zonedToUtc(`${day}T${clock}`, timezone));
  return now >= due && now - due <= catchupMinutes * 60000;
}
export function retryAt(attempts: number, now: number) {
  return new Date(
    now + Math.min(3600000, 60000 * 2 ** Math.max(0, attempts - 1)),
  );
}

export function sessionReminderDue(
  now: number,
  start: number,
  leadMinutes: number,
) {
  return (
    now >= start - leadMinutes * 60000 &&
    now < start + (leadMinutes === 0 ? 300000 : 0)
  );
}

export function candidateEnabled(kind: string, prefs: NotificationPreferences) {
  const flag: Partial<Record<string, keyof NotificationPreferences>> = {
    session: "sessionReminders",
    missed: "missedSessions",
    goalDeadline: "goalReminders",
    goalAlert: "goalReminders",
    taskDeadline: "goalReminders",
    morning: "morning",
    evening: "evening",
    weekly: "weekly",
    checkIn: "randomized",
    recovery: "goalReminders",
  };
  return !flag[kind] || prefs[flag[kind]!] === true;
}
/** Add minutes to an HH:mm clock, wrapping at midnight. */
export function shiftClock(clock: string, delta: number) {
  const value = (((minutes(clock) + delta) % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
