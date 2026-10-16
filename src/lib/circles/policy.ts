import { localDay, shiftDay, weekStart as localWeekStart, zonedToUtc } from "@/lib/analytics";

/**
 * Study Circles competition rules. Every number here is published on the
 * Leaderboard "How scoring works" panel and in docs/STUDY_CIRCLES.md.
 */
export const COMPETITION_TIMEZONE = "Asia/Colombo";
/** Weeks run Monday 00:00 to the next Monday 00:00 in COMPETITION_TIMEZONE (half-open). */
export const COMPETITION_FIRST_DAY = 1 as const;
/** The open timer reports while visible; a span is credited up to its last report plus this grace. */
export const HEARTBEAT_SECONDS = 60;
export const HEARTBEAT_GRACE_SECONDS = 90;
/** A heartbeat after a longer silence starts a new span, leaving the silent gap uncredited. */
export const HEARTBEAT_LEASE_SECONDS = 180;
/** Credit per timer session and per competition day, to discourage marathon sessions. */
export const SESSION_CREDIT_CAP_SECONDS = 4 * 3600;
export const DAILY_CREDIT_CAP_SECONDS = 10 * 3600;
/** Pieces shorter than this are not credited (matches the timer's one-minute minimum). */
export const MINIMUM_SESSION_SECONDS = 60;
/** Weeks are finalized after this delay, so sessions running at midnight can finish first. */
export const FINALIZE_AFTER_SECONDS = 24 * 3600;
export const LIMITS = { friends: 500, groups: 20, groupMembers: 50 } as const;

export type ExclusionReason = "sessionCap" | "dailyCap" | "weekFinalized" | "tooShort";

export interface Segment { startedAt: Date; lastSeenAt: Date; endedAt: Date | null }
export interface Span { start: number; end: number }

/** "2026-10-12" for the competition week containing `instant`. */
export function competitionWeekStart(instant: number | string) {
  return localWeekStart(localDay(instant, COMPETITION_TIMEZONE), COMPETITION_FIRST_DAY);
}
/** The competition week in progress right now. */
export const currentCompetitionWeek = () => competitionWeekStart(Date.now());
export function competitionDay(instant: number | string) {
  return localDay(instant, COMPETITION_TIMEZONE);
}
/** UTC bounds of a competition day or week given its first local day. */
export function dayBounds(day: string, days = 1) {
  return { startsAt: new Date(zonedToUtc(`${day}T00:00`, COMPETITION_TIMEZONE)), endsAt: new Date(zonedToUtc(`${shiftDay(day, days)}T00:00`, COMPETITION_TIMEZONE)) };
}
export const weekBounds = (week: string) => dayBounds(week, 7);

/**
 * The creditable part of a server-observed span: never past the last heartbeat
 * plus grace, so a closed laptop or a dropped connection stops earning credit.
 */
export function creditableSpan(segment: Segment, now: number): Span | null {
  const start = segment.startedAt.getTime();
  const end = Math.min(segment.endedAt?.getTime() ?? now, segment.lastSeenAt.getTime() + HEARTBEAT_GRACE_SECONDS * 1000, now);
  return end > start ? { start, end } : null;
}

/** Merge overlapping spans so no instant is credited twice. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

/** Remove already-credited time from new spans, so no instant is ever credited twice. */
export function subtractSpans(spans: Span[], taken: Span[]): Span[] {
  let rest = mergeSpans(spans);
  for (const cut of mergeSpans(taken)) {
    rest = rest.flatMap(span => {
      if (cut.end <= span.start || cut.start >= span.end) return [span];
      return [{ start: span.start, end: cut.start }, { start: cut.end, end: span.end }].filter(part => part.end > part.start);
    });
  }
  return rest;
}

/** Split spans at competition-day boundaries (which include week boundaries). */
export function splitByDay(spans: Span[]): (Span & { day: string })[] {
  const pieces: (Span & { day: string })[] = [];
  for (const span of spans) {
    let cursor = span.start;
    while (cursor < span.end) {
      const day = competitionDay(cursor);
      const next = Math.min(span.end, dayBounds(day).endsAt.getTime());
      if (next <= cursor) break;
      pieces.push({ day, start: cursor, end: next });
      cursor = next;
    }
  }
  return pieces;
}

export interface CreditPiece { day: string; week: string; start: number; end: number; creditedSeconds: number; excludedSeconds: number; exclusionReason: ExclusionReason | null }

/**
 * Turn a finished session's spans into ledger pieces. Applies, in order: the
 * minimum session length, the per-session cap, the per-day cap (given credit
 * already earned that day) and finalized weeks (no late credit).
 */
export function creditSession(spans: Span[], options: { creditedToday: (day: string) => number; finalizedWeeks: ReadonlySet<string> }): CreditPiece[] {
  const pieces = splitByDay(mergeSpans(spans));
  const totalSeconds = pieces.reduce((sum, piece) => sum + Math.floor((piece.end - piece.start) / 1000), 0);
  let sessionLeft = SESSION_CREDIT_CAP_SECONDS;
  const dayUsed = new Map<string, number>();
  return pieces.map(piece => {
    const seconds = Math.floor((piece.end - piece.start) / 1000);
    const week = localWeekStart(piece.day, COMPETITION_FIRST_DAY);
    const base = { day: piece.day, week, start: piece.start, end: piece.end };
    if (totalSeconds < MINIMUM_SESSION_SECONDS) return { ...base, creditedSeconds: 0, excludedSeconds: seconds, exclusionReason: "tooShort" as const };
    if (options.finalizedWeeks.has(week)) return { ...base, creditedSeconds: 0, excludedSeconds: seconds, exclusionReason: "weekFinalized" as const };
    const dayLeft = Math.max(0, DAILY_CREDIT_CAP_SECONDS - options.creditedToday(piece.day) - (dayUsed.get(piece.day) ?? 0));
    const credited = Math.max(0, Math.min(seconds, sessionLeft, dayLeft));
    sessionLeft -= credited;
    dayUsed.set(piece.day, (dayUsed.get(piece.day) ?? 0) + credited);
    const reason: ExclusionReason | null = credited === seconds ? null : sessionLeft <= 0 ? "sessionCap" : "dailyCap";
    return { ...base, creditedSeconds: credited, excludedSeconds: seconds - credited, exclusionReason: reason };
  });
}

export interface StandingInput { userId: string; name: string; seconds: number }
export interface Standing extends StandingInput { rank: number; behindNextSeconds: number | null }

/**
 * Standard competition ranking ("1224"): equal verified time shares a rank and
 * the next rank skips. Display order within a tie is by name, then user id, so
 * results never depend on database order. Rank 1 with time is the (shared) winner.
 */
export function rankStandings(rows: StandingInput[]): Standing[] {
  const sorted = [...rows].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || row.seconds !== sorted[index - 1].seconds) rank = index + 1;
    const above = sorted.slice(0, index).reverse().find(other => other.seconds > row.seconds);
    return { ...row, rank, behindNextSeconds: above ? above.seconds - row.seconds : null };
  });
}
export const winnersOf = (standings: Standing[]) => standings.filter(row => row.rank === 1 && row.seconds > 0);

/** Consecutive competition days with at least `minimum` credited seconds, ending today or yesterday. */
export function verifiedStreak(secondsByDay: ReadonlyMap<string, number>, today: string, minimum: number) {
  let day = (secondsByDay.get(today) ?? 0) >= minimum ? today : shiftDay(today, -1);
  let streak = 0;
  while ((secondsByDay.get(day) ?? 0) >= minimum) { streak++; day = shiftDay(day, -1); }
  return streak;
}

/** A finalized week ended at least FINALIZE_AFTER_SECONDS ago. */
export function weeksReadyToFinalize(now: number, earliest: string) {
  const weeks: string[] = [];
  for (let week = earliest; weekBounds(week).endsAt.getTime() + FINALIZE_AFTER_SECONDS * 1000 <= now; week = shiftDay(week, 7)) weeks.push(week);
  return weeks;
}
