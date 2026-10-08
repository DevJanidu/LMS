import type { ScheduleBlock } from "@/types";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
export interface BlockOccurrence {
  block: ScheduleBlock;
  date: string;
  startsAt: string;
  endsAt: string;
  title: string;
}
/** Expand weekly rules and exceptions in the block's own timezone. */
export function getOccurrences(
  blocks: readonly ScheduleBlock[],
  from: string,
  to: string,
): BlockOccurrence[] {
  const result: BlockOccurrence[] = [];
  for (const block of blocks) {
    const first = localDay(block.startsAt, block.timezone);
    const daySpan = Math.round(
      (Date.parse(`${localDay(block.endsAt, block.timezone)}T12:00:00Z`) -
        Date.parse(`${first}T12:00:00Z`)) /
        86400000,
    );
    if (block.repeat === "once") {
      if (first >= from && first <= to)
        result.push({
          block,
          date: first,
          startsAt: block.startsAt,
          endsAt: block.endsAt,
          title: block.title,
        });
      continue;
    }
    const startClock = wallTime(block.startsAt, block.timezone).slice(11);
    const endClock = wallTime(block.endsAt, block.timezone).slice(11);
    const exceptionDays = new Set(block.exceptions.map(item => item.date));
    for (let day = from; day <= to; day = shiftDay(day, 1)) {
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (
        day < first ||
        (block.recurrenceUntil && day > block.recurrenceUntil) ||
        !block.weekdays.includes(weekday)
      )
        continue;
      if (exceptionDays.has(day)) continue;
      result.push({
        block,
        date: day,
        title: block.title,
        startsAt: zonedToUtc(`${day}T${startClock}`, block.timezone),
        endsAt: zonedToUtc(
          `${shiftDay(day, daySpan)}T${endClock}`,
          block.timezone,
        ),
      });
    }
    for (const exception of block.exceptions) {
      if (
        exception.cancelled ||
        exception.date < first ||
        (block.recurrenceUntil && exception.date > block.recurrenceUntil)
      )
        continue;
      const startsAt =
        exception.startsAt ??
        zonedToUtc(
          `${exception.date}T${wallTime(block.startsAt, block.timezone).slice(11)}`,
          block.timezone,
        );
      const endsAt =
        exception.endsAt ??
        zonedToUtc(
          `${shiftDay(exception.date, daySpan)}T${wallTime(block.endsAt, block.timezone).slice(11)}`,
          block.timezone,
        );
      const displayedDay = localDay(startsAt, block.timezone);
      if (displayedDay < from || displayedDay > to) continue;
      result.push({
        block: { ...block, ...Object.fromEntries(Object.entries(exception).filter(([, value]) => value !== undefined)),
          ...Object.fromEntries(Object.entries(exception.overrides ?? {}).map(([key, value]) => [key, value ?? undefined])), id: block.id },
        date: exception.date,
        title: exception.title ?? block.title,
        startsAt,
        endsAt,
      });
    }
  }
  return result.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
