import { describe, expect, it } from "vitest";
import {
  notificationPreferenceSchema,
  aiPreferenceSchema,
} from "@/lib/aven/validation";
import {
  dueLocalTime,
  inQuietHours,
  mayNotify,
  missedStart,
  randomCheckInTime,
  retryAt,
  sessionReminderDue,
} from "@/lib/aven/scheduler-model";
import { overlaps, validateSchedule } from "@/lib/aven/planning";
describe("Aven deterministic scheduling", () => {
  it("fires zero-lead reminders once within the next scheduler window", () => {
    const start = Date.parse("2026-10-11T10:00:00Z");
    expect(sessionReminderDue(start - 1, start, 0)).toBe(false);
    expect(sessionReminderDue(start, start, 0)).toBe(true);
    expect(sessionReminderDue(start + 299999, start, 0)).toBe(true);
    expect(sessionReminderDue(start + 300000, start, 0)).toBe(false);
    expect(sessionReminderDue(start - 900000, start, 15)).toBe(true);
    expect(sessionReminderDue(start, start, 15)).toBe(false);
  });
  it("handles overnight quiet hours and disabled quiet periods", () => {
    expect(inQuietHours("23:30", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("06:30", "22:00", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "22:00", "07:00")).toBe(false);
    expect(inQuietHours("12:00", "07:00", "07:00")).toBe(false);
  });
  it("uses the account timezone for due times, including non-hour offsets", () => {
    expect(
      dueLocalTime(Date.parse("2026-10-11T01:35:00Z"), "Asia/Colombo", "07:00"),
    ).toBe(true);
    expect(
      dueLocalTime(Date.parse("2026-10-11T01:20:00Z"), "Asia/Colombo", "07:00"),
    ).toBe(false);
    expect(
      dueLocalTime(Date.parse("2026-10-11T03:00:00Z"), "Asia/Colombo", "07:00"),
    ).toBe(false);
  });
  it("respects opt-in, daily caps and snoozing", () => {
    const now = Date.parse("2026-10-11T10:00:00Z"),
      prefs = notificationPreferenceSchema.parse({ enabled: true });
    expect(mayNotify(prefs, now, "UTC", 0)).toBe(true);
    expect(mayNotify(prefs, now, "UTC", 3)).toBe(false);
    expect(mayNotify({ ...prefs, enabled: false }, now, "UTC", 0)).toBe(false);
    expect(
      mayNotify(
        { ...prefs, snoozedUntil: "2026-10-12T00:00:00Z" },
        now,
        "UTC",
        0,
      ),
    ).toBe(false);
  });
  it("makes bounded random times stable across retries", () => {
    const first = randomCheckInTime("user-a", "2026-10-11", "12:00", "17:00");
    expect(first).toBe(
      randomCheckInTime("user-a", "2026-10-11", "12:00", "17:00"),
    );
    expect(first >= "12:00" && first < "17:00").toBe(true);
  });
  it("does not call a session missed when a relevant timer or verified session exists", () => {
    const start = "2026-10-11T10:00:00Z",
      end = "2026-10-11T11:30:00Z",
      now = Date.parse("2026-10-11T10:12:00Z");
    expect(missedStart(start, end, "subject", [], undefined, now, 10)).toBe(
      true,
    );
    expect(
      missedStart(
        start,
        end,
        "subject",
        [],
        undefined,
        Date.parse("2026-10-11T10:05:00Z"),
        10,
      ),
    ).toBe(false);
    expect(
      missedStart(
        start,
        end,
        "subject",
        [{ subjectId: "subject", startedAt: start, status: "valid" }],
        undefined,
        now,
        10,
      ),
    ).toBe(false);
    expect(
      missedStart(
        start,
        end,
        "subject",
        [],
        { subjectId: "subject", startedAt: start },
        now,
        10,
      ),
    ).toBe(false);
    expect(
      missedStart(
        start,
        end,
        "subject",
        [{ subjectId: "other", startedAt: start, status: "valid" }],
        undefined,
        now,
        10,
      ),
    ).toBe(true);
  });
  it("rejects overlap, unrealistic durations and overloaded daily plans", () => {
    const now = Date.parse("2026-10-11T09:00:00Z"),
      a = { startsAt: "2026-10-11T10:00:00Z", endsAt: "2026-10-11T11:00:00Z" },
      b = { startsAt: "2026-10-11T10:30:00Z", endsAt: "2026-10-11T11:30:00Z" };
    expect(overlaps(a, b)).toBe(true);
    expect(() => validateSchedule([a], [b], now, 90, "UTC")).toThrow(
      "scheduleOverlap",
    );
    expect(() =>
      validateSchedule(
        [
          a,
          { startsAt: "2026-10-11T12:00:00Z", endsAt: "2026-10-11T13:00:00Z" },
        ],
        [],
        now,
        90,
        "UTC",
      ),
    ).toThrow("scheduleOverloaded");
    expect(() => validateSchedule([a], [], now, 90, "UTC")).not.toThrow();
  });
  it("uses capped exponential retry timing", () => {
    expect(retryAt(1, 0).getTime()).toBe(60000);
    expect(retryAt(2, 0).getTime()).toBe(120000);
    expect(retryAt(8, 0).getTime()).toBe(3600000);
  });
  it("validates study windows and notification windows", () => {
    expect(
      aiPreferenceSchema.safeParse({
        preferredStudyStart: "20:00",
        preferredStudyEnd: "17:00",
      }).success,
    ).toBe(false);
    expect(
      notificationPreferenceSchema.safeParse({
        allowedStart: "17:00",
        allowedEnd: "12:00",
      }).success,
    ).toBe(false);
  });
});
