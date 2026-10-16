import { describe, expect, it } from "vitest";
import {
  competitionWeekStart, creditSession, creditableSpan, DAILY_CREDIT_CAP_SECONDS, HEARTBEAT_GRACE_SECONDS, mergeSpans,
  rankStandings, SESSION_CREDIT_CAP_SECONDS, subtractSpans, verifiedStreak, weekBounds, weeksReadyToFinalize, winnersOf,
} from "@/lib/circles/policy";

// Asia/Colombo is UTC+05:30: Monday 2026-10-12 00:00 local is 2026-10-11T18:30Z.
const at = (iso: string) => Date.parse(iso);
const none = { creditedToday: () => 0, finalizedWeeks: new Set<string>() };

describe("competition calendar", () => {
  it("uses Monday 00:00 to Monday 00:00 in Asia/Colombo, stored as UTC", () => {
    expect(weekBounds("2026-10-12")).toEqual({ startsAt: new Date("2026-10-11T18:30:00Z"), endsAt: new Date("2026-10-18T18:30:00Z") });
    expect(competitionWeekStart(at("2026-10-11T18:29:59Z"))).toBe("2026-10-05");
    expect(competitionWeekStart(at("2026-10-11T18:30:00Z"))).toBe("2026-10-12");
  });
  it("finalizes a week only a day after it ends", () => {
    expect(weeksReadyToFinalize(at("2026-10-19T18:29:00Z"), "2026-10-12")).toEqual([]);
    expect(weeksReadyToFinalize(at("2026-10-19T18:30:00Z"), "2026-10-12")).toEqual(["2026-10-12"]);
  });
});

describe("verified time", () => {
  it("Test D: credits active spans only, so paused time is excluded", () => {
    // 09:00-09:30 active, paused 30 minutes, 10:00-10:45 active (heartbeats throughout).
    const spans = [{ start: at("2026-10-13T03:30:00Z"), end: at("2026-10-13T04:00:00Z") }, { start: at("2026-10-13T04:30:00Z"), end: at("2026-10-13T05:15:00Z") }];
    const pieces = creditSession(spans, none);
    expect(pieces.reduce((sum, piece) => sum + piece.creditedSeconds, 0)).toBe(75 * 60);
    expect(pieces.every(piece => piece.week === "2026-10-12" && piece.exclusionReason === null)).toBe(true);
  });
  it("Test N: a silent client earns nothing past its last heartbeat plus grace", () => {
    const segment = { startedAt: new Date("2026-10-13T03:30:00Z"), lastSeenAt: new Date("2026-10-13T03:40:00Z"), endedAt: null };
    const span = creditableSpan(segment, at("2026-10-13T09:30:00Z"))!;
    expect((span.end - span.start) / 1000).toBe(10 * 60 + HEARTBEAT_GRACE_SECONDS);
  });
  it("Test M: a session across the week boundary is split between both weeks without double counting", () => {
    const spans = [{ start: at("2026-10-11T17:30:00Z"), end: at("2026-10-11T19:30:00Z") }]; // Sun 23:00 to Mon 01:00 local
    const pieces = creditSession(spans, none);
    expect(pieces.map(piece => [piece.week, piece.day, piece.creditedSeconds])).toEqual([["2026-10-05", "2026-10-11", 3600], ["2026-10-12", "2026-10-12", 3600]]);
  });
  it("Test F: overlapping spans from two devices are credited once", () => {
    const merged = mergeSpans([{ start: 0, end: 3_600_000 }, { start: 1_800_000, end: 5_400_000 }]);
    expect(merged).toEqual([{ start: 0, end: 5_400_000 }]);
  });
  it("never credits an instant already credited by another session", () => {
    expect(subtractSpans([{ start: 0, end: 100 }], [{ start: 20, end: 40 }, { start: 90, end: 200 }])).toEqual([{ start: 0, end: 20 }, { start: 40, end: 90 }]);
    expect(subtractSpans([{ start: 0, end: 100 }], [{ start: 0, end: 100 }])).toEqual([]);
  });
  it("caps a marathon session and the competition day, recording why", () => {
    const long = creditSession([{ start: at("2026-10-13T00:00:00Z"), end: at("2026-10-13T06:00:00Z") }], none);
    expect(long[0]).toMatchObject({ creditedSeconds: SESSION_CREDIT_CAP_SECONDS, excludedSeconds: 2 * 3600, exclusionReason: "sessionCap" });
    const lateInDay = creditSession([{ start: at("2026-10-13T10:00:00Z"), end: at("2026-10-13T11:00:00Z") }], { ...none, creditedToday: () => DAILY_CREDIT_CAP_SECONDS - 600 });
    expect(lateInDay[0]).toMatchObject({ creditedSeconds: 600, exclusionReason: "dailyCap" });
  });
  it("gives no late credit to a finalized week and ignores sub-minute sessions", () => {
    expect(creditSession([{ start: 0, end: 30_000 }], none)[0]).toMatchObject({ creditedSeconds: 0, exclusionReason: "tooShort" });
    const spans = [{ start: at("2026-10-13T03:30:00Z"), end: at("2026-10-13T04:30:00Z") }];
    expect(creditSession(spans, { ...none, finalizedWeeks: new Set(["2026-10-12"]) })[0]).toMatchObject({ creditedSeconds: 0, exclusionReason: "weekFinalized" });
  });
});

describe("rankings", () => {
  it("Test H: ranks ten users by verified time with the gap to the next rank", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ userId: `u${index}`, name: `User ${index}`, seconds: (index + 1) * 3600 }));
    const standings = rankStandings(rows);
    expect(standings.map(row => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(standings[0]).toMatchObject({ userId: "u9", seconds: 36000, behindNextSeconds: null });
    expect(standings[1].behindNextSeconds).toBe(3600);
  });
  it("Test I: equal time shares a rank, the next rank skips, and both are winners", () => {
    const standings = rankStandings([
      { userId: "b", name: "Hasini", seconds: 7200 }, { userId: "a", name: "Nimal", seconds: 7200 }, { userId: "c", name: "Kavindu", seconds: 3600 },
    ]);
    expect(standings.map(row => [row.name, row.rank])).toEqual([["Hasini", 1], ["Nimal", 1], ["Kavindu", 3]]);
    expect(winnersOf(standings).map(row => row.name)).toEqual(["Hasini", "Nimal"]);
    expect(standings[2].behindNextSeconds).toBe(3600);
    // Same input in any order gives the same result.
    expect(rankStandings([...standings].reverse())).toEqual(standings);
  });
  it("has no winner in a week where nobody studied", () => {
    expect(winnersOf(rankStandings([{ userId: "a", name: "A", seconds: 0 }]))).toEqual([]);
  });
  it("counts a verified streak ending today or yesterday", () => {
    const days = new Map([["2026-10-16", 900], ["2026-10-15", 1200], ["2026-10-14", 700], ["2026-10-13", 60]]);
    expect(verifiedStreak(days, "2026-10-16", 600)).toBe(3);
    expect(verifiedStreak(days, "2026-10-17", 600)).toBe(3);
    expect(verifiedStreak(days, "2026-10-18", 600)).toBe(0);
  });
});
