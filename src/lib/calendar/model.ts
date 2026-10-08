import type { ScheduleBlock, ScheduleException } from "@/types";
import type { CalendarCommand } from "@/lib/validation/calendar";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { getOccurrences, type BlockOccurrence } from "@/lib/schedule";

export type CalendarRange = { from: string; to: string };
export type CalendarChange = { blocks: ScheduleBlock[]; removed: string[] };
export const occurrenceId = (item: BlockOccurrence) => item.block.repeat === "once" ? item.block.id : `${item.block.id}@${item.date}`;
const dayDifference = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00Z`) - Date.parse(`${b}T12:00Z`)) / 86400000);
const shiftedInstant = (instant: string, minutes: number, timezone: string) => zonedToUtc(
  new Date(Date.parse(`${wallTime(instant, timezone)}:00Z`) + minutes * 60000).toISOString().slice(0, 16), timezone,
);

/** Calendar ranges have an exclusive end; include overnight events and moved exceptions. */
export function calendarOccurrences(blocks: readonly ScheduleBlock[], range: CalendarRange, timezone: string) {
  const start = Date.parse(zonedToUtc(`${range.from}T00:00`, timezone));
  const end = Date.parse(zonedToUtc(`${range.to}T00:00`, timezone));
  return blocks.flatMap(block => {
    const span = Math.max(0, dayDifference(localDay(block.endsAt, block.timezone), localDay(block.startsAt, block.timezone)));
    return getOccurrences([block], shiftDay(range.from, -span - 2), shiftDay(range.to, 2));
  }).filter(item => Date.parse(item.startsAt) < end && Date.parse(item.endsAt) > start)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Pure command reducer used by the optimistic client and the transactional server. */
export function applyCalendarCommand(original: ScheduleBlock | undefined, command: CalendarCommand, userId: string, now: string): CalendarChange {
  if (command.kind === "create") return { blocks: [{ ...command.value, userId, createdAt: now, updatedAt: now }], removed: [] };
  if (!original) throw new Error("recordUnavailable");
  const base = { ...original, updatedAt: now };
  if (base.repeat === "once") {
    if (command.kind === "delete") return { blocks: [], removed: [base.id] };
    return { blocks: [command.kind === "edit" ? { ...base, ...command.value, id: base.id, exceptions: [] } : { ...base, startsAt: command.startsAt, endsAt: command.endsAt }], removed: [] };
  }
  if (command.kind === "delete" && command.scope === "all") return { blocks: [], removed: [base.id] };
  const first = localDay(base.startsAt, base.timezone);
  const exception = base.exceptions.find(e => e.date === command.date);
  const sourceDay = exception?.startsAt ? localDay(exception.startsAt, base.timezone) : command.date;
  const occurrence = getOccurrences([base], sourceDay, sourceDay).find(o => o.date === command.date);
  if (!occurrence || command.date < first) throw new Error("recordUnavailable");
  if (command.scope === "one") {
    let next: ScheduleException;
    if (command.kind === "delete") next = { date: command.date, cancelled: true };
    else if (command.kind === "move") next = { ...exception, date: command.date, cancelled: false, startsAt: command.startsAt, endsAt: command.endsAt };
    else next = { date: command.date, cancelled: false, startsAt: command.value.startsAt, endsAt: command.value.endsAt,
      title: command.value.title, color: command.value.color,
      overrides: { subjectId: command.value.subjectId ?? null, topicId: command.value.topicId ?? null, note: command.value.note ?? null } };
    return { blocks: [{ ...base, exceptions: [...base.exceptions.filter(e => e.date !== command.date), next] }], removed: [] };
  }
  if (command.kind === "delete") {
    if (command.date === first) return { blocks: [], removed: [base.id] };
    return { blocks: [{ ...base, recurrenceUntil: shiftDay(command.date, -1), exceptions: base.exceptions.filter(e => e.date < command.date) }], removed: [] };
  }
  const value = command.kind === "edit" ? command.value : undefined;
  const startsAt = command.kind === "move" ? command.startsAt : command.value.startsAt;
  const endsAt = command.kind === "move" ? command.endsAt : command.value.endsAt;
  const dayDelta = dayDifference(localDay(startsAt, base.timezone), localDay(occurrence.startsAt, base.timezone));
  const wallDelta = (Date.parse(`${wallTime(startsAt, base.timezone)}:00Z`) - Date.parse(`${wallTime(occurrence.startsAt, base.timezone)}:00Z`)) / 60000;
  const shiftExceptions = (items: ScheduleException[]) => items.map(e => ({ ...e, date: shiftDay(e.date, dayDelta),
    startsAt: e.startsAt ? shiftedInstant(e.startsAt, wallDelta, base.timezone) : undefined,
    endsAt: e.endsAt ? shiftedInstant(e.endsAt, wallDelta, base.timezone) : undefined }));
  const weekdays = value?.weekdays ?? base.weekdays.map(day => (day + dayDelta % 7 + 7) % 7);
  const until = value?.recurrenceUntil ?? (base.recurrenceUntil ? shiftDay(base.recurrenceUntil, dayDelta) : undefined);
  if (command.scope === "future") {
    const past = { ...base, recurrenceUntil: shiftDay(command.date, -1), exceptions: base.exceptions.filter(e => e.date < command.date) };
    const future = { ...base, ...value, id: command.newSeriesId!, startsAt, endsAt, weekdays,
      recurrenceUntil: until, createdAt: now, updatedAt: now, exceptions: shiftExceptions(base.exceptions.filter(e => e.date > command.date)) };
    return command.date === first ? { blocks: [future], removed: [base.id] } : { blocks: [past, future], removed: [] };
  }
  const nextStart = shiftedInstant(base.startsAt, wallDelta, base.timezone);
  const nextEnd = new Date(Date.parse(nextStart) + Date.parse(endsAt) - Date.parse(startsAt)).toISOString();
  return { blocks: [{ ...base, ...value, id: base.id, startsAt: nextStart, endsAt: nextEnd, weekdays,
    recurrenceUntil: until, exceptions: value?.repeat === "once" ? [] : shiftExceptions(base.exceptions) }], removed: [] };
}

export function mergeCalendarChange(blocks: readonly ScheduleBlock[], change: CalendarChange): ScheduleBlock[] {
  const replaced = new Set([...change.removed, ...change.blocks.map(b => b.id)]);
  return [...blocks.filter(b => !replaced.has(b.id)), ...change.blocks];
}
