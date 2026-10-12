import { describe, expect, it } from "vitest";
import {
  attendanceFor,
  attendanceStatus,
  canAttend,
} from "@/lib/study/attendance-model";
import type { BlockOccurrence } from "@/lib/schedule";
import type { AttendanceRecord } from "@/lib/study/attendance";
const occurrence = {
  block: { id: "block" },
  date: "2026-10-12",
  startsAt: "2026-10-12T12:30:00Z",
  endsAt: "2026-10-12T13:30:00Z",
} as BlockOccurrence;
const record = {
  id: "report",
  blockId: "block",
  date: occurrence.date,
  startsAt: occurrence.startsAt,
  status: "attended",
} as AttendanceRecord;
describe("scheduled study attendance", () => {
  it("matches only the exact recurring occurrence and schedule snapshot", () => {
    expect(attendanceFor(occurrence, [record])).toBe(record);
    for (const changed of [
      { ...record, blockId: "other" },
      { ...record, date: "2026-10-13" },
      { ...record, startsAt: "2026-10-12T14:30:00Z" },
    ])
      expect(attendanceFor(occurrence, [changed])).toBeUndefined();
  });
  it("does not carry an old attended status over to a rescheduled session", () => {
    expect(
      attendanceStatus(
        { ...occurrence, startsAt: "2026-10-13T12:30:00Z" },
        [record],
        Date.parse(occurrence.startsAt),
      ),
    ).toBe("pending");
  });
  it("distinguishes explicit attendance from missing attendance", () => {
    const now = Date.parse(occurrence.startsAt) + 3600000;
    expect(attendanceStatus(occurrence, [], now)).toBe("missed");
    for (const status of ["attended", "completed", "skipped"] as const)
      expect(attendanceStatus(occurrence, [{ ...record, status }], now)).toBe(
        status,
      );
    expect(
      attendanceStatus(occurrence, [], Date.parse(occurrence.startsAt) - 1),
    ).toBe("pending");
  });
  it("allows near-time attendance and next-day catch-up without admitting distant schedules", () => {
    const start = Date.parse(occurrence.startsAt),
      end = Date.parse(occurrence.endsAt);
    expect(canAttend(occurrence, start - 1800001)).toBe(false);
    expect(canAttend(occurrence, start - 1800000)).toBe(true);
    expect(canAttend(occurrence, end + 86400000)).toBe(true);
    expect(canAttend(occurrence, end + 86400001)).toBe(false);
  });
});
