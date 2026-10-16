import "server-only";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { shiftDay } from "@/lib/analytics";
import { GoalError } from "@/lib/goals/service";
import { COMPETITION_TIMEZONE, competitionWeekStart, rankStandings, weekBounds, weeksReadyToFinalize, winnersOf } from "./policy";
import type { Writer } from "./tracking";

/** How many past weeks a single run will catch up on after downtime. */
const CATCH_UP_WEEKS = 8;

/**
 * Finalize every week that ended at least a day ago. Each week is claimed with a
 * conditional update, so concurrent or repeated runs finalize it exactly once and
 * announce winners once (notifications are also de-duplicated by key).
 */
export async function finalizeReadyWeeks(now = new Date()) {
  const earliest = shiftDay(competitionWeekStart(now.getTime()), -7 * CATCH_UP_WEEKS);
  const finalized: string[] = [];
  for (const week of weeksReadyToFinalize(now.getTime(), earliest)) {
    if (await finalizeWeek(week, now)) finalized.push(week);
  }
  return { finalized };
}

export async function finalizeWeek(week: string, now = new Date()) {
  const db = getDb();
  const { startsAt, endsAt } = weekBounds(week);
  await db.insert(s.competitionWeeks).values({ weekStart: week, startsAt, endsAt, timezone: COMPETITION_TIMEZONE }).onConflictDoNothing();
  return db.transaction(async tx => {
    const claimed = await tx.update(s.competitionWeeks).set({ finalizedAt: now })
      .where(and(eq(s.competitionWeeks.weekStart, week), isNull(s.competitionWeeks.finalizedAt))).returning({ week: s.competitionWeeks.weekStart });
    if (!claimed.length) return false;
    const groups = await tx.select({ id: s.studyGroups.id, name: s.studyGroups.name }).from(s.studyGroups).orderBy(asc(s.studyGroups.id));
    for (const group of groups) await freezeGroup(tx, group, week, now);
    return true;
  });
}

/** Snapshot one group's roster and verified totals for a finalized week. */
async function freezeGroup(tx: Writer, group: { id: string; name: string }, week: string, now: Date) {
  const members = await tx.select({ id: s.studyGroupMembers.userId, name: s.users.name }).from(s.studyGroupMembers)
    .innerJoin(s.users, eq(s.users.id, s.studyGroupMembers.userId)).where(eq(s.studyGroupMembers.groupId, group.id));
  if (!members.length) return;
  const scores = await tx.select({ id: s.weeklyScores.userId, seconds: s.weeklyScores.creditedSeconds }).from(s.weeklyScores)
    .where(and(eq(s.weeklyScores.weekStart, week), inArray(s.weeklyScores.userId, members.map(member => member.id))));
  const seconds = new Map(scores.map(row => [row.id, row.seconds]));
  const standings = rankStandings(members.map(member => ({ userId: member.id, name: member.name, seconds: seconds.get(member.id) ?? 0 })));
  await tx.insert(s.groupWeekResults).values(standings.map(row => ({ groupId: group.id, weekStart: week, userId: row.userId, rank: row.rank, creditedSeconds: row.seconds }))).onConflictDoNothing();
  const winners = winnersOf(standings);
  if (!winners.length || members.length < 2) return;
  for (const winner of winners) {
    await tx.insert(s.socialActivities).values({ userId: winner.userId, kind: "groupWin", groupId: group.id, value: winner.seconds, deduplicationKey: `groupWin:${group.id}:${week}` }).onConflictDoNothing();
    const [{ wins }] = await tx.select({ wins: sql<number>`count(*)::int` }).from(s.groupWeekResults)
      .where(and(eq(s.groupWeekResults.userId, winner.userId), eq(s.groupWeekResults.rank, 1), gt(s.groupWeekResults.creditedSeconds, 0)));
    await tx.insert(s.achievements).values([{ userId: winner.userId, key: "weeklyChampion" }, ...(Number(wins) >= 3 ? [{ userId: winner.userId, key: "threeTimeChampion" }] : [])]).onConflictDoNothing();
  }
  const names = winners.map(winner => winner.name).join(" & ");
  for (const member of members) {
    await tx.insert(s.notifications).values({ userId: member.id, type: "circles", title: `${group.name}: ${names} won the week`, body: `Final standings for the week of ${week} are in. Open Study Circles to see them.`, deduplicationKey: `circles:winner:${group.id}:${week}`, scheduledFor: now }).onConflictDoNothing();
  }
}

/* ------------------------------------------------------------ Corrections */

/**
 * Audited correction by a platform administrator: invalidate or restore one
 * ledger piece. Weekly scores move by the exact credit, the reason is recorded,
 * and finalized group results for that week are recomputed and marked corrected.
 */
export async function correctInterval(actorId: string, intervalId: string, action: "invalidate" | "restore", reason: string) {
  return getDb().transaction(async tx => {
    const [actor] = await tx.select({ role: s.users.role, status: s.users.status }).from(s.users).where(eq(s.users.id, actorId));
    if (actor?.role !== "super_admin" || actor.status !== "active") throw new GoalError("recordUnavailable", 404);
    const [piece] = await tx.select().from(s.verifiedStudyIntervals).where(eq(s.verifiedStudyIntervals.id, intervalId)).for("update");
    if (!piece) throw new GoalError("recordUnavailable", 404);
    const target = action === "invalidate" ? "invalidated" : "counted";
    if (piece.status === target) return { changed: false };
    const delta = action === "invalidate" ? -piece.creditedSeconds : piece.creditedSeconds;
    await tx.update(s.verifiedStudyIntervals).set({ status: target }).where(eq(s.verifiedStudyIntervals.id, intervalId));
    await tx.update(s.weeklyScores).set({ creditedSeconds: sql`greatest(0, ${s.weeklyScores.creditedSeconds} + ${delta})`, updatedAt: new Date() })
      .where(and(eq(s.weeklyScores.userId, piece.userId), eq(s.weeklyScores.weekStart, piece.weekStart)));
    const [{ before, after }] = await tx.insert(s.scoreAdjustments).values({ intervalId, actorUserId: actorId, action, reason, beforeSeconds: action === "invalidate" ? piece.creditedSeconds : 0, afterSeconds: action === "invalidate" ? 0 : piece.creditedSeconds })
      .returning({ before: s.scoreAdjustments.beforeSeconds, after: s.scoreAdjustments.afterSeconds });
    await tx.insert(s.auditLogs).values({ actorUserId: actorId, action: `circles.${action}`, targetType: "user", targetId: piece.userId, metadata: { intervalId, week: piece.weekStart, before, after } });
    // Finalized weeks change only here: re-rank the affected groups' frozen results.
    const affected = await tx.select({ groupId: s.groupWeekResults.groupId }).from(s.groupWeekResults).where(and(eq(s.groupWeekResults.userId, piece.userId), eq(s.groupWeekResults.weekStart, piece.weekStart)));
    for (const { groupId } of affected) {
      await tx.update(s.groupWeekResults).set({ creditedSeconds: sql`greatest(0, ${s.groupWeekResults.creditedSeconds} + ${delta})` })
        .where(and(eq(s.groupWeekResults.groupId, groupId), eq(s.groupWeekResults.weekStart, piece.weekStart), eq(s.groupWeekResults.userId, piece.userId)));
      const rows = await tx.select({ userId: s.groupWeekResults.userId, seconds: s.groupWeekResults.creditedSeconds, name: s.users.name }).from(s.groupWeekResults)
        .innerJoin(s.users, eq(s.users.id, s.groupWeekResults.userId)).where(and(eq(s.groupWeekResults.groupId, groupId), eq(s.groupWeekResults.weekStart, piece.weekStart)));
      for (const row of rankStandings(rows)) {
        await tx.update(s.groupWeekResults).set({ rank: row.rank, correctedAt: new Date() })
          .where(and(eq(s.groupWeekResults.groupId, groupId), eq(s.groupWeekResults.weekStart, piece.weekStart), eq(s.groupWeekResults.userId, row.userId)));
      }
    }
    return { changed: true, delta };
  });
}

/** Rebuild weekly scores from the ledger for a user (drift check / repair). */
export async function reconcileWeeklyScores(userId: string) {
  return getDb().transaction(async tx => {
    const truth = await tx.select({ week: s.verifiedStudyIntervals.weekStart, seconds: sql<number>`sum(${s.verifiedStudyIntervals.creditedSeconds}) FILTER (WHERE ${s.verifiedStudyIntervals.status} = 'counted')::int`, sessions: sql<number>`count(DISTINCT ${s.verifiedStudyIntervals.timerStartedAt})::int` })
      .from(s.verifiedStudyIntervals).where(eq(s.verifiedStudyIntervals.userId, userId)).groupBy(s.verifiedStudyIntervals.weekStart);
    let changed = 0;
    for (const row of truth) {
      const updated = await tx.insert(s.weeklyScores).values({ userId, weekStart: row.week, creditedSeconds: Number(row.seconds ?? 0), sessions: Number(row.sessions) })
        .onConflictDoUpdate({ target: [s.weeklyScores.userId, s.weeklyScores.weekStart], set: { creditedSeconds: Number(row.seconds ?? 0), sessions: Number(row.sessions), updatedAt: new Date() }, setWhere: sql`${s.weeklyScores.creditedSeconds} <> ${Number(row.seconds ?? 0)}` })
        .returning({ week: s.weeklyScores.weekStart });
      changed += updated.length;
    }
    return { weeks: truth.length, changed };
  });
}
