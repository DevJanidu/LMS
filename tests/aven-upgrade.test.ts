import { expect, it } from "vitest";
import { boundedHistory } from "@/lib/aven/context";
import { candidateEnabled } from "@/lib/aven/scheduler-model";
import {
  notificationPreferenceSchema,
  proposalSchema,
} from "@/lib/aven/validation";
import { committedMinutes, validateSchedule } from "@/lib/aven/planning";
import { ambiguousScheduleClock } from "@/lib/aven/time-intent";
import { claimsUnapprovedChange } from "@/lib/aven/reply-safety";
import { aiPreferenceSchema } from "@/lib/aven/validation";
it("keeps English when an older account saved another AI language", () => {
  expect(aiPreferenceSchema.parse({ consent: true, locale: "ar" }).locale).toBe("en");
  expect(aiPreferenceSchema.parse({ locale: "de" }).locale).toBe("en");
});
it("distinguishes a proposed change from an unsupported claim of execution", () => {
  expect(claimsUnapprovedChange("I created a goal for you.")).toBe(true);
  expect(claimsUnapprovedChange("Your session has been rescheduled.")).toBe(
    true,
  );
  expect(
    claimsUnapprovedChange(
      "I have prepared a proposal. Review the approval card.",
    ),
  ).toBe(false);
});
it("requires clock clarification without mistaking 'I am busy' for AM", () => {
  expect(ambiguousScheduleClock("I am busy. Move tomorrow to 9:30.")).toBe(
    "9:30",
  );
  expect(ambiguousScheduleClock("Move tomorrow to 9:30 AM.")).toBeNull();
  expect(ambiguousScheduleClock("Move tomorrow to 21:30.")).toBeNull();
  expect(ambiguousScheduleClock("Yes, tomorrow at 9.", true)).toBe("9");
  expect(ambiguousScheduleClock("نقل موعد الدراسة إلى الساعة ٩:٣٠")).toBe(
    "9:30",
  );
});
it("preserves recent context within a UTF-8 budget and excludes failed placeholders", () => {
  const rows = [
    { role: "user", content: "old ".repeat(6000) },
    { role: "assistant", content: "aiKeyInvalid", status: "error" },
    { role: "assistant", content: "generationStopped", status: "cancelled" },
    { role: "user", content: "My latest question?" },
  ];
  const value = boundedHistory(rows, 500);
  expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThanOrEqual(500);
  expect(value.at(-1)?.content).toBe("My latest question?");
  expect(value).toHaveLength(1);
  const unicode = boundedHistory(
    [{ role: "user", content: "学習😀".repeat(3000) }],
    1000,
  );
  expect(Buffer.byteLength(JSON.stringify(unicode))).toBeLessThanOrEqual(1000);
  expect(unicode[0]?.content).not.toContain("\ufffd");
});
it("rechecks each opted-out reminder kind without disabling ordinary manual reminders", () => {
  const prefs = notificationPreferenceSchema.parse({
    randomized: false,
    sessionReminders: false,
  });
  expect(candidateEnabled("checkIn", prefs)).toBe(false);
  expect(candidateEnabled("session", prefs)).toBe(false);
  expect(candidateEnabled("goalDeadline", prefs)).toBe(true);
  expect(candidateEnabled("manual", prefs)).toBe(true);
});
it("counts existing commitments across local midnight in capacity validation", () => {
  const commitments = [
    { startsAt: "2026-10-11T18:00:00Z", endsAt: "2026-10-11T19:30:00Z" },
  ];
  expect(committedMinutes("2026-10-12", "Asia/Colombo", commitments)).toBe(60);
  expect(() =>
    validateSchedule(
      [{ startsAt: "2026-10-12T03:30:00Z", endsAt: "2026-10-12T04:30:00Z" }],
      commitments,
      Date.parse("2026-10-11T00:00Z"),
      90,
      "Asia/Colombo",
    ),
  ).toThrow("scheduleOverloaded");
});
it("accepts an ongoing recurring commitment and rejects an invalid cancellation scope", () => {
  const value = {
    kind: "calendarCreate",
    explanation: "Study on weekdays",
    title: "Java",
    subjectId: null,
    topicId: null,
    startsAt: "2026-10-13T04:00:00Z",
    endsAt: "2026-10-13T05:00:00Z",
    timezone: "Asia/Colombo",
    repeat: "weekly",
    weekdays: [1, 2, 3, 4, 5],
    until: null,
  };
  expect(proposalSchema.safeParse(value).success).toBe(true);
  expect(
    proposalSchema.safeParse({
      kind: "calendarChanges",
      explanation: "Cancel",
      changes: [
        {
          action: "cancel",
          blockId: crypto.randomUUID(),
          date: "2026-10-13",
          expectedUpdatedAt: "2026-10-12T00:00:00Z",
          scope: "database",
        },
      ],
    }).success,
  ).toBe(false);
});
