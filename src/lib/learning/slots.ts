import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";
import { committedMinutes, overlaps } from "@/lib/aven/planning";
/**
 * Free-slot search shared by practice and multi-subject scheduling. Only known
 * availability counts: the given window on the given day, minus every commitment with a
 * 15-minute break on each side. Nothing outside the window is treated as free.
 */
export interface Commitment {
  startsAt: string;
  endsAt: string;
}
export const BREAK_MS = 15 * 60000;
export function firstFreeSlot(input: {
  day: string;
  start: string;
  end: string;
  minutes: number;
  commitments: Commitment[];
  timezone: string;
  now: number;
}) {
  const windowEnd = Date.parse(zonedToUtc(`${input.day}T${input.end}`, input.timezone));
  let cursor = Math.max(
    // Leave time to prepare; round to the next quarter hour.
    Math.ceil((input.now + 30 * 60000) / (15 * 60000)) * 15 * 60000,
    Date.parse(zonedToUtc(`${input.day}T${input.start}`, input.timezone)),
  );
  const length = input.minutes * 60000;
  while (cursor + length <= windowEnd) {
    const padded = {
      startsAt: new Date(cursor - BREAK_MS).toISOString(),
      endsAt: new Date(cursor + length + BREAK_MS).toISOString(),
    };
    const conflict = input.commitments
      .filter((item) => overlaps(padded, item))
      .sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
    if (!conflict)
      return {
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(cursor + length).toISOString(),
      };
    cursor = Date.parse(conflict.endsAt) + BREAK_MS;
  }
  return null;
}
export const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
export interface SubjectRequest {
  subjectId: string;
  title: string;
  sessions: number;
}
/**
 * Several subjects in one window ("Java, SQL and Spring Boot next week after 7 PM").
 * Sessions are interleaved across subjects, spread to the least-loaded study day, at most
 * one per subject per day, each day within the daily target. Unplaced sessions are
 * reported with the binding constraint; nothing existing is moved or deleted.
 */
export function planStudySessions(input: {
  subjects: SubjectRequest[];
  minutes: number;
  from: string;
  to: string;
  earliest: string;
  latest: string;
  studyDays: number[];
  dailyTargetMinutes: number;
  commitments: (Commitment & { title?: string; date?: string; blockId?: string })[];
  timezone: string;
  now: number;
}) {
  const today = localDay(input.now, input.timezone);
  const days: string[] = [];
  for (let day = input.from < today ? today : input.from; day <= input.to && days.length < 14; day = shiftDay(day, 1))
    if (input.studyDays.includes(weekday(day))) days.push(day);
  const queue: SubjectRequest[] = [];
  const most = Math.max(0, ...input.subjects.map((item) => item.sessions));
  for (let round = 0; round < most; round++)
    for (const subject of input.subjects) if (round < subject.sessions) queue.push(subject);
  const placed: { subjectId: string; title: string; startsAt: string; endsAt: string; day: string }[] = [];
  let limitedByDailyTarget = false,
    limitedByWindow = false;
  for (const item of queue) {
    const candidates = days
      .filter((day) => !placed.some((p) => p.day === day && p.subjectId === item.subjectId))
      .sort(
        (a, b) =>
          placed.filter((p) => p.day === a).length - placed.filter((p) => p.day === b).length ||
          a.localeCompare(b),
      );
    for (const day of candidates) {
      const taken = [...input.commitments, ...placed];
      const slot = firstFreeSlot({
        day,
        start: input.earliest,
        end: input.latest,
        minutes: input.minutes,
        commitments: taken,
        timezone: input.timezone,
        now: input.now,
      });
      if (!slot) {
        limitedByWindow = true;
        continue;
      }
      if (committedMinutes(day, input.timezone, taken) + input.minutes > input.dailyTargetMinutes) {
        limitedByDailyTarget = true;
        continue;
      }
      placed.push({ subjectId: item.subjectId, title: item.title, day, ...slot });
      break;
    }
  }
  const unplaced = input.subjects
    .map((subject) => ({
      subjectId: subject.subjectId,
      title: subject.title,
      missing: subject.sessions - placed.filter((p) => p.subjectId === subject.subjectId).length,
    }))
    .filter((item) => item.missing > 0);
  return {
    sessions: placed
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(({ subjectId, title, startsAt, endsAt }) => ({ subjectId, title, startsAt, endsAt })),
    days,
    unplaced,
    constraint: !unplaced.length
      ? null
      : !days.length
        ? ("noStudyDays" as const)
        : limitedByDailyTarget && !limitedByWindow
          ? ("dailyTarget" as const)
          : ("noFreeTime" as const),
    tradeoffs: unplaced.length
      ? input.commitments
          .filter((item) => Date.parse(item.startsAt) > input.now && item.blockId)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 3)
          .map(({ blockId, title, startsAt, endsAt }) => ({ blockId: blockId!, title: title ?? "", startsAt, endsAt }))
      : [],
  };
}
