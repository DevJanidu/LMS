import type { ScheduleBlock } from "@/types";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
export interface BlockOccurrence { block: ScheduleBlock; date: string; startsAt: string; endsAt: string; title: string }
/** Expand weekly rules and exceptions in the block's own timezone. */
export function getOccurrences(blocks: readonly ScheduleBlock[], from: string, to: string): BlockOccurrence[] {
  const result: BlockOccurrence[] = [];
  for (const block of blocks) {
    const first = localDay(block.startsAt, block.timezone);
    if (block.repeat === "once") {
      if (first >= from && first <= to) result.push({ block, date: first, startsAt: block.startsAt, endsAt: block.endsAt, title: block.title });
      continue;
    }
    for (let day = from; day <= to; day = shiftDay(day, 1)) {
      const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (day < first || (block.recurrenceUntil && day > block.recurrenceUntil) || (!block.weekdays.includes(weekday) && day !== first)) continue;
      const exception = block.exceptions.find((item) => item.date === day);
      if (exception?.cancelled) continue;
      const startClock = wallTime(block.startsAt, block.timezone).slice(11);
      const endClock = wallTime(block.endsAt, block.timezone).slice(11);
      result.push({ block: exception ? { ...block, ...exception, id: block.id } : block, date: day, title: exception?.title ?? block.title, startsAt: exception?.startsAt ?? zonedToUtc(`${day}T${startClock}`, block.timezone), endsAt: exception?.endsAt ?? zonedToUtc(`${day}T${endClock}`, block.timezone) });
    }
  }
  return result.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
