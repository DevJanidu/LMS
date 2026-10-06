import { describe, expect, it } from "vitest";
import { hash, verify } from "@node-rs/argon2";
import { uploadSchema, urlSchema, sessionSchema, profileSchema, blockSchema } from "@/lib/validation";
import { operationsSchema } from "@/lib/validation/operations";
import { validateEnvironment } from "@/lib/env";
import { timerElapsed, dailySeconds, streaks, subjectProgress, weeklyGoalPercent } from "@/lib/analytics";
import { getOccurrences } from "@/lib/schedule";
import type { StudySession, ScheduleBlock } from "@/types";
import { finishSnapshot } from "@/lib/timer";
import { ageInYears } from "@/lib/validation/age";
import { csvCell } from "@/lib/csv";

const id = "11111111-1111-4111-8111-111111111111";
const session: StudySession = { id, userId: id, subjectId: id, source: "manual", status: "valid", startedAt: "2026-10-01T23:50:00Z", endedAt: "2026-10-02T00:10:00Z", durationSeconds: 1200, createdAt: "2026-10-02T00:10:00Z" };
describe("validated domain inputs", () => {
  it("escapes CSV quotes and disables user-provided spreadsheet formulas", () => {
    expect(csvCell('A "name"')).toBe('"A ""name"""');
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell("\t@SUM(1)")).toBe('"\'\t@SUM(1)"');
    expect(csvCell("learner@example.com")).toBe('"learner@example.com"');
  });
  it("checks age on the actual birthday rather than just the birth year", () => {
    expect(ageInYears("2010-10-07", new Date("2026-10-06T12:00:00Z"))).toBe(15);
    expect(ageInYears("2010-10-06", new Date("2026-10-06T12:00:00Z"))).toBe(16);
  });
  it("accepts web links and rejects executable, data and file URLs", () => {
    expect(urlSchema.safeParse("https://example.com/docs").success).toBe(true);
    for (const value of ["javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "ftp://example.com"]) expect(urlSchema.safeParse(value).success).toBe(false);
  });
  it("requires matching upload MIME and extension and positive file size", () => {
    const value = { subjectId: id, title: "Reading", name: "reading.pdf", mimeType: "application/pdf", sizeBytes: 100 };
    expect(uploadSchema.safeParse(value).success).toBe(true);
    for (const patch of [{ name: "reading.exe" }, { mimeType: "text/html" }, { sizeBytes: -1 }, { name: "reading.pdf.exe" }]) expect(uploadSchema.safeParse({ ...value, ...patch }).success).toBe(false);
  });
  it("rejects future and reversed session timestamps", () => {
    expect(sessionSchema.safeParse(session).success).toBe(true);
    expect(sessionSchema.safeParse({ ...session, endedAt: session.startedAt }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...session, startedAt: "2099-01-01T00:00:00Z", endedAt: "2099-01-01T01:00:00Z" }).success).toBe(false);
  });
  it("rejects invalid time zones and cannot change roles through profile operations", () => {
    const profile = { name: "Learner", timezone: "Asia/Colombo", weeklyTargetMinutes: 120, theme: "auto", weekStartDay: 1, reminders: true, role: "super_admin", userId: id };
    const parsed = profileSchema.parse(profile);
    expect(parsed).not.toHaveProperty("role"); expect(parsed).not.toHaveProperty("userId");
    expect(profileSchema.safeParse({ ...profile, timezone: "Invalid/Zone" }).success).toBe(false);
    expect(operationsSchema.safeParse([{ kind: "makeAdmin", id }]).success).toBe(false);
  });
  it("requires a subject for a scheduled topic", () => {
    expect(blockSchema.safeParse({ id, title: "Revision", startsAt: session.startedAt, endsAt: session.endedAt, repeat: "once", weekdays: [], timezone: "UTC", color: "brand", exceptions: [], topicId: id }).success).toBe(false);
  });
  it("never includes secret values in configuration errors", () => {
    const secret = "invalid-database-secret-value";
    expect(() => validateEnvironment({ DATABASE_URL: secret })).toThrow("DATABASE_URL");
    try { validateEnvironment({ DATABASE_URL: secret }); } catch (error) { expect(String(error)).not.toContain(secret); }
  });
});
describe("time and analytics rules", () => {
  it("discards short sessions and caps unanswered timers at the actual checkpoint", () => {
    const timer = { subjectId: id, startedAt: "2026-10-01T00:00:00Z", pausedTotalSeconds: 0, confirmedUntilSeconds: 21600 };
    expect(finishSnapshot(timer, Date.parse("2026-10-01T00:00:59Z")).saved).toBe(false);
    const finished = finishSnapshot(timer, Date.parse("2026-10-02T00:00:00Z"));
    expect(finished.durationSeconds).toBe(21600);
    expect(finished.endedAt.toISOString()).toBe("2026-10-01T06:00:00.000Z");
    const extended = finishSnapshot({ ...timer, confirmedUntilSeconds: 43200 }, Date.parse("2026-10-01T08:00:00Z"));
    expect(extended.durationSeconds).toBe(28800);
  });
  it("does not count time spent in a paused finish dialog", () => {
    const finished = finishSnapshot({ subjectId: id, startedAt: "2026-10-01T12:00:00Z", pausedAt: "2026-10-01T12:03:00Z", pausedTotalSeconds: 60, confirmedUntilSeconds: 21600 }, Date.parse("2026-10-01T16:00:00Z"));
    expect(finished.durationSeconds).toBe(120); expect(finished.endedAt.toISOString()).toBe("2026-10-01T12:03:00.000Z");
  });
  it("uses server timestamps and excludes paused time", () => {
    const timer = { subjectId: id, startedAt: "2026-10-01T12:00:00Z", pausedAt: "2026-10-01T12:05:00Z", pausedTotalSeconds: 60, confirmedUntilSeconds: 21600 };
    expect(timerElapsed(timer, Date.parse("2026-10-02T00:00:00Z"))).toBe(240);
  });
  it("splits midnight sessions, treats yesterday's streak as current and rounds progress", () => {
    const totals = dailySeconds([session], "UTC");
    expect(totals["2026-10-01"]).toBe(600); expect(totals["2026-10-02"]).toBe(600);
    expect(streaks([session], "UTC", Date.parse("2026-10-03T12:00:00Z"))).toEqual({ current: 2, longest: 2 });
    expect(subjectProgress([])).toBe(0); expect(weeklyGoalPercent(1000, 100)).toBe(100);
  });
  it("preserves a previously earned longest streak after historical sessions disappear", () => {
    expect(streaks([], "UTC", Date.parse("2026-10-03T12:00:00Z"), 10, 30)).toEqual({ current: 0, longest: 30 });
  });
  it("keeps recurring local clock times across DST and respects cancelled occurrences", () => {
    const block: ScheduleBlock = { id, userId: id, title: "Weekly revision", startsAt: "2026-03-01T14:00:00Z", endsAt: "2026-03-01T15:00:00Z", repeat: "weekly", weekdays: [0], timezone: "America/New_York", color: "brand", exceptions: [{ date: "2026-03-15", cancelled: true }], createdAt: session.createdAt, updatedAt: session.createdAt };
    const rows = getOccurrences([block], "2026-03-01", "2026-03-15");
    expect(rows.map(row => row.startsAt)).toEqual(["2026-03-01T14:00:00.000Z", "2026-03-08T13:00:00.000Z"]);
  });
});
it("hashes passwords with Argon2id and verifies only the correct password", async () => {
  const digest = await hash("fixture-password-only", { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  expect(digest).toMatch(/^\$argon2id\$/);
  expect(await verify(digest, "fixture-password-only")).toBe(true);
  expect(await verify(digest, "wrong-password")).toBe(false);
});
