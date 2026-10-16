import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { shiftDay } from "@/lib/analytics";
import { friendsLeaderboard, groupLeaderboard } from "./leaderboard";
import { myGroups } from "./social";
import { COMPETITION_TIMEZONE, competitionWeekStart, DAILY_CREDIT_CAP_SECONDS, SESSION_CREDIT_CAP_SECONDS } from "./policy";

const minutes = (seconds: number) => Math.round(seconds / 60);

/**
 * What Aven may know about the student's Study Circles: built only from the
 * same privacy-filtered views the student sees, so a tool call cannot reach
 * anything the interface would not show (no emails, subjects or sessions of others).
 */
export async function studyCirclesSnapshot(userId: string) {
  const week = competitionWeekStart(Date.now());
  const [friends, groups, [lastWeek]] = await Promise.all([
    friendsLeaderboard(userId, week),
    myGroups(userId),
    getDb().select({ seconds: s.weeklyScores.creditedSeconds }).from(s.weeklyScores).where(and(eq(s.weeklyScores.userId, userId), eq(s.weeklyScores.weekStart, shiftDay(week, -7)))),
  ]);
  const me = friends.rows.find(row => row.me)!;
  const groupBoards = await Promise.all(groups.slice(0, 10).map(group => groupLeaderboard(userId, group.id, week)));
  return {
    week, weekEndsAt: friends.bounds.endsAt.toISOString(), timezone: COMPETITION_TIMEZONE,
    rules: { countsOnly: "verified timer time (manual logs never count)", sessionCapMinutes: minutes(SESSION_CREDIT_CAP_SECONDS), dailyCapMinutes: minutes(DAILY_CREDIT_CAP_SECONDS), ties: "equal time shares a rank" },
    me: { verifiedMinutesThisWeek: minutes(me.seconds), verifiedMinutesLastWeek: minutes(lastWeek?.seconds ?? 0), friendsRank: me.rank, minutesBehindNextRank: me.behindNextSeconds === null ? null : minutes(me.behindNextSeconds), streakDays: me.streak },
    friendsLeaderboard: friends.rows.slice(0, 20).map(row => ({ rank: row.rank, name: row.me ? "You" : row.name, verifiedMinutes: minutes(row.seconds) })),
    groups: groupBoards.map(board => {
      const mine = board.rows.find(row => row.me);
      return { name: board.group.name, members: board.rows.length, myRank: mine?.rank ?? null, minutesBehindNextRank: mine?.behindNextSeconds == null ? null : minutes(mine.behindNextSeconds), leader: board.rows[0] ? { name: board.rows[0].me ? "You" : board.rows[0].name, verifiedMinutes: minutes(board.rows[0].seconds) } : null, groupVerifiedMinutes: minutes(board.totalSeconds) };
    }),
  };
}
