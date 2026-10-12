import type { BlockOccurrence } from "@/lib/schedule";
import type { AttendanceRecord } from "./attendance";
export function attendanceFor(
  occurrence: BlockOccurrence,
  records: AttendanceRecord[],
) {
  return records.find(
    (row) =>
      row.blockId === occurrence.block.id &&
      row.date === occurrence.date &&
      Date.parse(row.startsAt) === Date.parse(occurrence.startsAt),
  );
}
export function canAttend(occurrence: BlockOccurrence, now: number) {
  return (
    now >= Date.parse(occurrence.startsAt) - 30 * 60000 &&
    now <= Date.parse(occurrence.endsAt) + 86400000
  );
}
export function attendanceStatus(
  occurrence: BlockOccurrence,
  records: AttendanceRecord[],
  now: number,
) {
  return (
    attendanceFor(occurrence, records)?.status ??
    (now >= Date.parse(occurrence.startsAt) + 10 * 60000 ? "missed" : "pending")
  );
}
