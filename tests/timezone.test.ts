import { expect, it } from "vitest";
import { validTimezone, timezoneOptions } from "@/lib/timezone";
import { calendarDisplayInstant } from "@/lib/calendar/model";
it("supports worldwide IANA zones including half-hour and quarter-hour offsets", () => {
  const instant = "2026-10-12T05:44:00Z";
  for (const [timezone, expected] of Object.entries({
    "Asia/Colombo": "2026-10-12T11:14:00Z",
    "Asia/Kathmandu": "2026-10-12T11:29:00Z",
    "America/New_York": "2026-10-12T01:44:00Z",
    "Europe/London": "2026-10-12T06:44:00Z",
    "Australia/Sydney": "2026-10-12T16:44:00Z",
    "Pacific/Kiritimati": "2026-10-12T19:44:00Z",
    "Pacific/Pago_Pago": "2026-10-11T18:44:00Z",
  })) {
    expect(validTimezone(timezone)).toBe(true);
    expect(calendarDisplayInstant(instant, timezone)).toBe(expected);
  }
});
it("uses daylight-saving offsets rather than a fixed country offset", () => {
  expect(
    calendarDisplayInstant("2026-01-15T12:00:00Z", "America/New_York"),
  ).toBe("2026-01-15T07:00:00Z");
  expect(
    calendarDisplayInstant("2026-07-15T12:00:00Z", "America/New_York"),
  ).toBe("2026-07-15T08:00:00Z");
  expect(
    calendarDisplayInstant("2026-07-15T12:00:00Z", "Australia/Sydney"),
  ).toBe("2026-07-15T22:00:00Z");
});
it("rejects invalid zones and presents the full searchable timezone list", () => {
  expect(validTimezone("not/a/timezone")).toBe(false);
  expect(validTimezone("+99:99")).toBe(false);
  expect(validTimezone("UTC")).toBe(true);
  const list = timezoneOptions("Asia/Colombo");
  expect(list.length).toBeGreaterThan(300);
  expect(list).toContain("Pacific/Auckland");
  expect(list).toContain("UTC");
  expect(list).toContain("Asia/Colombo");
});
