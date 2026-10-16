import "server-only";
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { shiftDay } from "@/lib/analytics";
import { GoalError } from "@/lib/goals/service";
import { competitionDay, competitionWeekStart, rankStandings, verifiedStreak, weekBounds, type Standing } from "./policy";
import { canSeeActivity, friendIds, privacyOf, requireMember, type SocialPrivacy } from "./social";

export interface Person { id: string; name: string; image: string | null }
export interface LeaderRow extends Standing { image: string | null; me: boolean; streak: number | null }
const STREAK_MINUTES = 10;

async function people(ids: string[]): Promise<Map<string, Person>> {
  if (!ids.length) return new Map();
  const rows = await getDb().select({ id: s.users.id, name: s.users.name, image: s.users.image }).from(s.users).where(and(inArray(s.users.id, ids), eq(s.users.status, "active")));
  return new Map(rows.map(row => [row.id, row]));
}
async function weekSeconds(ids: string[], week: string) {
  if (!ids.length) return new Map<string, number>();
  const rows = await getDb().select({ id: s.weeklyScores.userId, seconds: s.weeklyScores.creditedSeconds }).from(s.weeklyScores).where(and(inArray(s.weeklyScores.userId, ids), eq(s.weeklyScores.weekStart, week)));
  return new Map(rows.map(row => [row.id, row.seconds]));
}
/** Verified streaks for many users in one indexed query over the last 60 competition days. */
async function streaks(ids: string[]) {
  const today = competitionDay(Date.now());
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const rows = await getDb().select({ id: s.verifiedStudyIntervals.userId, day: s.verifiedStudyIntervals.localDay, seconds: sql<number>`sum(${s.verifiedStudyIntervals.creditedSeconds})::int` })
    .from(s.verifiedStudyIntervals)
    .where(and(inArray(s.verifiedStudyIntervals.userId, ids), eq(s.verifiedStudyIntervals.status, "counted"), gte(s.verifiedStudyIntervals.localDay, shiftDay(today, -60))))
    .groupBy(s.verifiedStudyIntervals.userId, s.verifiedStudyIntervals.localDay);
  const days = new Map<string, Map<string, number>>();
  for (const row of rows) { if (!days.has(row.id)) days.set(row.id, new Map()); days.get(row.id)!.set(row.day, Number(row.seconds)); }
  for (const id of ids) map.set(id, verifiedStreak(days.get(id) ?? new Map(), today, STREAK_MINUTES * 60));
  return map;
}
async function isFinalized(week: string) {
  const [row] = await getDb().select({ at: s.competitionWeeks.finalizedAt }).from(s.competitionWeeks).where(eq(s.competitionWeeks.weekStart, week));
  return Boolean(row?.at);
}
function board(ids: string[], names: Map<string, Person>, seconds: Map<string, number>, privacy: Map<string, SocialPrivacy>, streak: Map<string, number>, me: string): LeaderRow[] {
  const standings = rankStandings(ids.filter(id => names.has(id)).map(id => ({ userId: id, name: names.get(id)!.name, seconds: seconds.get(id) ?? 0 })));
  return standings.map(row => ({ ...row, image: names.get(row.userId)!.image, me: row.userId === me, streak: row.userId === me || privacy.get(row.userId)?.shareStreak ? streak.get(row.userId) ?? 0 : null }));
}

/** You plus friends who appear on leaderboards, ranked by verified time this week. */
export async function friendsLeaderboard(userId: string, week = competitionWeekStart(Date.now())) {
  const friends = await friendIds(userId);
  const privacy = await privacyOf(friends);
  const ids = [userId, ...friends.filter(id => privacy.get(id)!.showOnLeaderboards)];
  const [names, seconds, streak] = await Promise.all([people(ids), weekSeconds(ids, week), streaks(ids)]);
  return { week, bounds: weekBounds(week), rows: board(ids, names, seconds, privacy, streak, userId) };
}

/** Group standings: live for open weeks, frozen results for finalized ones. Members only. */
export async function groupLeaderboard(userId: string, groupId: string, week = competitionWeekStart(Date.now())) {
  const role = await requireMember(groupId, userId);
  const db = getDb();
  const [group] = await db.select().from(s.studyGroups).where(eq(s.studyGroups.id, groupId));
  const memberRows = await db.select({ id: s.studyGroupMembers.userId, role: s.studyGroupMembers.role, joinedAt: s.studyGroupMembers.joinedAt }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.groupId, groupId)).orderBy(asc(s.studyGroupMembers.joinedAt));
  const finalized = await isFinalized(week);
  let rows: LeaderRow[];
  if (finalized) {
    const frozen = await db.select().from(s.groupWeekResults).where(and(eq(s.groupWeekResults.groupId, groupId), eq(s.groupWeekResults.weekStart, week)));
    const names = await people(frozen.map(row => row.userId));
    rows = rankStandings(frozen.filter(row => names.has(row.userId)).map(row => ({ userId: row.userId, name: names.get(row.userId)!.name, seconds: row.creditedSeconds })))
      .map(row => ({ ...row, image: names.get(row.userId)!.image, me: row.userId === userId, streak: null }));
  } else {
    const ids = memberRows.map(row => row.id);
    const [names, seconds, privacy, streak] = await Promise.all([people(ids), weekSeconds(ids, week), privacyOf(ids), streaks(ids)]);
    rows = board(ids, names, seconds, privacy, streak, userId);
  }
  const previous = shiftDay(week, -7);
  const previousWinners = (await isFinalized(previous)) ? await groupWinners(groupId, previous) : [];
  const roles = new Map(memberRows.map(row => [row.id, row.role]));
  const invitations = role === "member" ? [] : await db.select({ id: s.studyGroupInvitations.id, inviteeId: s.studyGroupInvitations.inviteeId, createdAt: s.studyGroupInvitations.createdAt })
    .from(s.studyGroupInvitations).where(and(eq(s.studyGroupInvitations.groupId, groupId), eq(s.studyGroupInvitations.status, "pending")));
  const inviteeNames = await people(invitations.map(row => row.inviteeId));
  return {
    group: { id: group.id, name: group.name, description: group.description, color: group.color, myRole: role },
    week, bounds: weekBounds(week), finalized,
    totalSeconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    rows: rows.map(row => ({ ...row, role: roles.get(row.userId) ?? "member" })),
    previousWinners,
    invitations: invitations.map(row => ({ id: row.id, name: inviteeNames.get(row.inviteeId)?.name ?? "", createdAt: row.createdAt.toISOString() })),
  };
}

async function groupWinners(groupId: string, week: string) {
  const rows = await getDb().select({ userId: s.groupWeekResults.userId, seconds: s.groupWeekResults.creditedSeconds }).from(s.groupWeekResults)
    .where(and(eq(s.groupWeekResults.groupId, groupId), eq(s.groupWeekResults.weekStart, week), eq(s.groupWeekResults.rank, 1), sql`${s.groupWeekResults.creditedSeconds} > 0`));
  const names = await people(rows.map(row => row.userId));
  return rows.map(row => ({ userId: row.userId, name: names.get(row.userId)?.name ?? "", seconds: row.seconds }));
}

/** Finalized weeks for a group: winners, group total and your rank. Members only. */
export async function groupHistory(userId: string, groupId: string) {
  await requireMember(groupId, userId);
  const rows = await getDb().select().from(s.groupWeekResults).where(eq(s.groupWeekResults.groupId, groupId)).orderBy(desc(s.groupWeekResults.weekStart), asc(s.groupWeekResults.rank)).limit(500);
  const names = await people([...new Set(rows.map(row => row.userId))]);
  const weeks = new Map<string, typeof rows>();
  for (const row of rows) { if (!weeks.has(row.weekStart)) weeks.set(row.weekStart, []); weeks.get(row.weekStart)!.push(row); }
  return [...weeks.entries()].slice(0, 26).map(([week, list]) => ({
    week, totalSeconds: list.reduce((sum, row) => sum + row.creditedSeconds, 0),
    winners: list.filter(row => row.rank === 1 && row.creditedSeconds > 0).map(row => ({ name: names.get(row.userId)?.name ?? "", seconds: row.creditedSeconds })),
    myRank: list.find(row => row.userId === userId)?.rank ?? null, members: list.length, corrected: list.some(row => row.correctedAt),
  }));
}

/** Friends with what their privacy settings allow. Emails are never included. */
export async function friendsList(userId: string) {
  const ids = await friendIds(userId);
  const week = competitionWeekStart(Date.now());
  const [names, seconds, privacy, streak, ranking] = await Promise.all([people(ids), weekSeconds(ids, week), privacyOf(ids), streaks(ids), friendsLeaderboard(userId, week)]);
  const ranks = new Map(ranking.rows.map(row => [row.userId, row.rank]));
  const last = ids.length ? await getDb().select({ id: s.socialActivities.userId, at: sql<string>`max(${s.socialActivities.createdAt})` }).from(s.socialActivities).where(inArray(s.socialActivities.userId, ids)).groupBy(s.socialActivities.userId) : [];
  const lastActive = new Map(last.map(row => [row.id, row.at]));
  return ids.filter(id => names.has(id)).map(id => {
    const p = privacy.get(id)!;
    return {
      ...names.get(id)!,
      weekSeconds: p.showOnLeaderboards ? seconds.get(id) ?? 0 : null,
      rank: p.showOnLeaderboards ? ranks.get(id) ?? null : null,
      streak: p.shareStreak ? streak.get(id) ?? 0 : null,
      lastActivityAt: p.activityVisibility !== "private" && lastActive.get(id) ? new Date(lastActive.get(id)!).toISOString() : null,
    };
  }).sort((a, b) => (b.weekSeconds ?? -1) - (a.weekSeconds ?? -1) || a.name.localeCompare(b.name));
}

export async function requests(userId: string) {
  const db = getDb();
  const [incoming, outgoing, groupInvites] = await Promise.all([
    db.select({ id: s.friendRequests.id, senderId: s.friendRequests.senderId, createdAt: s.friendRequests.createdAt }).from(s.friendRequests)
      .where(and(eq(s.friendRequests.recipientId, userId), eq(s.friendRequests.status, "pending"))).orderBy(desc(s.friendRequests.createdAt)).limit(100),
    db.select({ id: s.friendInvitations.id, maskedEmail: s.friendInvitations.maskedEmail, createdAt: s.friendInvitations.createdAt }).from(s.friendInvitations)
      .leftJoin(s.friendRequests, eq(s.friendRequests.id, s.friendInvitations.requestId))
      // Accepted invitations become friendships; every other state stays "sent" to the sender.
      .where(and(eq(s.friendInvitations.senderId, userId), sql`coalesce(${s.friendRequests.status}, 'pending') <> 'accepted'`)).orderBy(desc(s.friendInvitations.createdAt)).limit(100),
    db.select({ id: s.studyGroupInvitations.id, groupId: s.studyGroupInvitations.groupId, inviterId: s.studyGroupInvitations.inviterId, createdAt: s.studyGroupInvitations.createdAt, groupName: s.studyGroups.name })
      .from(s.studyGroupInvitations).innerJoin(s.studyGroups, eq(s.studyGroups.id, s.studyGroupInvitations.groupId))
      .where(and(eq(s.studyGroupInvitations.inviteeId, userId), eq(s.studyGroupInvitations.status, "pending"))).limit(100),
  ]);
  const names = await people([...new Set([...incoming.map(row => row.senderId), ...groupInvites.map(row => row.inviterId)])]);
  return {
    incoming: incoming.filter(row => names.has(row.senderId)).map(row => ({ id: row.id, name: names.get(row.senderId)!.name, image: names.get(row.senderId)!.image, createdAt: row.createdAt.toISOString() })),
    outgoing: outgoing.map(row => ({ id: row.id, maskedEmail: row.maskedEmail, createdAt: row.createdAt.toISOString() })),
    groupInvitations: groupInvites.map(row => ({ id: row.id, groupName: row.groupName, inviterName: names.get(row.inviterId)?.name ?? "", createdAt: row.createdAt.toISOString() })),
  };
}

export interface FeedItem { id: string; userId: string; name: string; image: string | null; me: boolean; kind: string; value: number; subject: string | null; group: string | null; createdAt: string }

/** Activity from you, friends and group co-members whose visibility lets you see it. */
export async function activityFeed(userId: string, limit = 30): Promise<FeedItem[]> {
  const db = getDb();
  const friends = await friendIds(userId);
  const coMembers = (await db.execute<{ id: string }>(sql`SELECT DISTINCT y.user_id AS id FROM study_group_members x JOIN study_group_members y ON y.group_id = x.group_id WHERE x.user_id = ${userId}::uuid AND y.user_id <> ${userId}::uuid LIMIT 1000`)).rows.map(row => row.id);
  const candidates = [...new Set([...friends, ...coMembers])];
  const privacy = await privacyOf(candidates);
  const friendSet = new Set(friends);
  const blocks = candidates.length ? await db.select({ a: s.userBlocks.blockerId, b: s.userBlocks.blockedId }).from(s.userBlocks)
    .where(or(and(eq(s.userBlocks.blockerId, userId), inArray(s.userBlocks.blockedId, candidates)), and(eq(s.userBlocks.blockedId, userId), inArray(s.userBlocks.blockerId, candidates)))) : [];
  const blocked = new Set(blocks.flatMap(row => [row.a, row.b]));
  const visible = candidates.filter(id => !blocked.has(id) && (privacy.get(id)!.activityVisibility === "groups" || (privacy.get(id)!.activityVisibility === "friends" && friendSet.has(id))));
  const owners = [userId, ...visible];
  const rows = await db.select({ id: s.socialActivities.id, userId: s.socialActivities.userId, kind: s.socialActivities.kind, value: s.socialActivities.value, createdAt: s.socialActivities.createdAt, subjectTitle: s.subjects.title, groupName: s.studyGroups.name, groupId: s.socialActivities.groupId })
    .from(s.socialActivities).leftJoin(s.subjects, eq(s.subjects.id, s.socialActivities.subjectId)).leftJoin(s.studyGroups, eq(s.studyGroups.id, s.socialActivities.groupId))
    .where(inArray(s.socialActivities.userId, owners)).orderBy(desc(s.socialActivities.createdAt)).limit(limit * 2);
  const myGroups = new Set((await db.select({ id: s.studyGroupMembers.groupId }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.userId, userId))).map(row => row.id));
  const names = await people(owners);
  return rows.filter(row => names.has(row.userId) && (!row.groupId || myGroups.has(row.groupId))).slice(0, limit).map(row => {
    const me = row.userId === userId;
    return {
      id: row.id, userId: row.userId, name: names.get(row.userId)!.name, image: names.get(row.userId)!.image, me, kind: row.kind, value: row.value,
      // Subject names only for your own activity or when the owner shares them.
      subject: me || privacy.get(row.userId)?.shareSubjects ? row.subjectTitle ?? null : null,
      group: row.groupName ?? null, createdAt: row.createdAt.toISOString(),
    };
  });
}

/** Your own sessions for a week: what was credited, what was excluded and why, and manual logs. */
export async function studyHistory(userId: string, week = competitionWeekStart(Date.now())) {
  const db = getDb();
  const { startsAt, endsAt } = weekBounds(week);
  const [pieces, manual] = await Promise.all([
    db.select({ timerStartedAt: s.verifiedStudyIntervals.timerStartedAt, startedAt: s.verifiedStudyIntervals.startedAt, endedAt: s.verifiedStudyIntervals.endedAt, day: s.verifiedStudyIntervals.localDay,
      credited: s.verifiedStudyIntervals.creditedSeconds, excluded: s.verifiedStudyIntervals.excludedSeconds, reason: s.verifiedStudyIntervals.exclusionReason, status: s.verifiedStudyIntervals.status, subject: s.subjects.title,
      sessionStartedAt: s.studySessions.startedAt, sessionEndedAt: s.studySessions.endedAt })
      .from(s.verifiedStudyIntervals).leftJoin(s.subjects, eq(s.subjects.id, s.verifiedStudyIntervals.subjectId)).leftJoin(s.studySessions, eq(s.studySessions.id, s.verifiedStudyIntervals.studySessionId))
      .where(and(eq(s.verifiedStudyIntervals.userId, userId), eq(s.verifiedStudyIntervals.weekStart, week))).orderBy(asc(s.verifiedStudyIntervals.startedAt)),
    db.select({ id: s.studySessions.id, startedAt: s.studySessions.startedAt, endedAt: s.studySessions.endedAt, seconds: s.studySessions.durationSeconds, subject: s.subjects.title })
      .from(s.studySessions).innerJoin(s.subjects, eq(s.subjects.id, s.studySessions.subjectId))
      .where(and(eq(s.studySessions.userId, userId), eq(s.studySessions.source, "manual"), eq(s.studySessions.status, "valid"), gte(s.studySessions.startedAt, startsAt), lt(s.studySessions.startedAt, endsAt)))
      .orderBy(asc(s.studySessions.startedAt)),
  ]);
  const sessions = new Map<string, { subject: string | null; startedAt: string; endedAt: string; activeSeconds: number; creditedSeconds: number; excludedSeconds: number; reasons: string[]; invalidated: boolean; day: string; pausedSeconds: number }>();
  for (const piece of pieces) {
    const key = piece.timerStartedAt.toISOString();
    const entry = sessions.get(key) ?? { subject: piece.subject, startedAt: (piece.sessionStartedAt ?? piece.startedAt).toISOString(), endedAt: (piece.sessionEndedAt ?? piece.endedAt).toISOString(), activeSeconds: 0, creditedSeconds: 0, excludedSeconds: 0, reasons: [], invalidated: false, day: piece.day, pausedSeconds: 0 };
    entry.activeSeconds += Math.floor((piece.endedAt.getTime() - piece.startedAt.getTime()) / 1000);
    entry.creditedSeconds += piece.status === "counted" ? piece.credited : 0;
    entry.excludedSeconds += piece.excluded + (piece.status === "invalidated" ? piece.credited : 0);
    if (piece.reason && !entry.reasons.includes(piece.reason)) entry.reasons.push(piece.reason);
    if (piece.status === "invalidated") entry.invalidated = true;
    sessions.set(key, entry);
  }
  for (const entry of sessions.values()) entry.pausedSeconds = Math.max(0, Math.floor((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000) - entry.activeSeconds);
  const verified = [...sessions.values()];
  return {
    week, bounds: weekBounds(week),
    totalCreditedSeconds: verified.reduce((sum, row) => sum + row.creditedSeconds, 0),
    sessions: verified,
    manual: manual.map(row => ({ id: row.id, subject: row.subject, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt.toISOString(), seconds: row.seconds })),
  };
}

/** A friend's daily verified totals, only when their visibility allows it. Subjects only if they share them. */
export async function friendHistory(viewerId: string, ownerId: string, week = competitionWeekStart(Date.now())) {
  if (!(await canSeeActivity(viewerId, ownerId))) throw new GoalError("recordUnavailable", 404);
  const privacy = (await privacyOf([ownerId])).get(ownerId)!;
  const rows = await getDb().select({ day: s.verifiedStudyIntervals.localDay, seconds: sql<number>`sum(${s.verifiedStudyIntervals.creditedSeconds})::int`, subject: s.subjects.title })
    .from(s.verifiedStudyIntervals).leftJoin(s.subjects, eq(s.subjects.id, s.verifiedStudyIntervals.subjectId))
    .where(and(eq(s.verifiedStudyIntervals.userId, ownerId), eq(s.verifiedStudyIntervals.weekStart, week), eq(s.verifiedStudyIntervals.status, "counted")))
    .groupBy(s.verifiedStudyIntervals.localDay, s.subjects.title).orderBy(asc(s.verifiedStudyIntervals.localDay));
  const [person] = [...(await people([ownerId])).values()];
  const days = new Map<string, { day: string; seconds: number; subjects: { name: string; seconds: number }[] }>();
  for (const row of rows) {
    const entry = days.get(row.day) ?? { day: row.day, seconds: 0, subjects: [] };
    entry.seconds += Number(row.seconds);
    if (privacy.shareSubjects && row.subject) entry.subjects.push({ name: row.subject, seconds: Number(row.seconds) });
    days.set(row.day, entry);
  }
  const list = [...days.values()];
  return { person: person ? { name: person.name, image: person.image } : null, week, shareSubjects: privacy.shareSubjects, days: list, totalSeconds: list.reduce((sum, row) => sum + row.seconds, 0) };
}

/** Personal competition record: recent weeks, best week, group wins and achievements. */
export async function competitionRecord(userId: string) {
  const db = getDb();
  const [weeks, wins, earned] = await Promise.all([
    db.select({ week: s.weeklyScores.weekStart, seconds: s.weeklyScores.creditedSeconds, sessions: s.weeklyScores.sessions }).from(s.weeklyScores).where(eq(s.weeklyScores.userId, userId)).orderBy(desc(s.weeklyScores.weekStart)).limit(12),
    db.select({ count: sql<number>`count(*)::int` }).from(s.groupWeekResults).where(and(eq(s.groupWeekResults.userId, userId), eq(s.groupWeekResults.rank, 1), sql`${s.groupWeekResults.creditedSeconds} > 0`)),
    db.select({ key: s.achievements.key, earnedAt: s.achievements.earnedAt }).from(s.achievements).where(eq(s.achievements.userId, userId)).orderBy(asc(s.achievements.earnedAt)),
  ]);
  const best = await db.select({ week: s.weeklyScores.weekStart, seconds: s.weeklyScores.creditedSeconds }).from(s.weeklyScores).where(eq(s.weeklyScores.userId, userId)).orderBy(desc(s.weeklyScores.creditedSeconds)).limit(1);
  return {
    weeks: weeks.map(row => ({ week: row.week, seconds: row.seconds, sessions: row.sessions })),
    bestWeek: best[0] && best[0].seconds > 0 ? best[0] : null,
    groupWins: Number(wins[0]?.count ?? 0),
    achievements: earned.map(row => ({ key: row.key, earnedAt: row.earnedAt.toISOString() })),
  };
}

export async function overview(userId: string) {
  const week = competitionWeekStart(Date.now());
  const [leaderboard, pending, feed, record, groups] = await Promise.all([
    friendsLeaderboard(userId, week), requests(userId), activityFeed(userId, 12), competitionRecord(userId),
    getDb().select({ count: sql<number>`count(*)::int` }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.userId, userId)),
  ]);
  const mine = leaderboard.rows.find(row => row.me)!;
  return {
    week, bounds: leaderboard.bounds, me: mine, top: leaderboard.rows.slice(0, 5), participants: leaderboard.rows.length,
    incomingRequests: pending.incoming.length, groupInvitations: pending.groupInvitations.length, groups: Number(groups[0]?.count ?? 0), feed, record,
  };
}

/** Friends or co-members a user can invite into a group: their friends not already in it. */
export async function invitableFriends(userId: string, groupId: string) {
  await requireMember(groupId, userId);
  const ids = await friendIds(userId);
  const members = new Set((await getDb().select({ id: s.studyGroupMembers.userId }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.groupId, groupId))).map(row => row.id));
  const names = await people(ids.filter(id => !members.has(id)));
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
}

