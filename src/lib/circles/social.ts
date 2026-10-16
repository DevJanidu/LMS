import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import { LIMITS } from "./policy";
import type { Writer } from "./tracking";

export type Visibility = "private" | "friends" | "groups";
export interface SocialPrivacy { acceptRequests: boolean; activityVisibility: Visibility; shareSubjects: boolean; shareStreak: boolean; showOnLeaderboards: boolean }
export const DEFAULT_PRIVACY: SocialPrivacy = { acceptRequests: true, activityVisibility: "friends", shareSubjects: false, shareStreak: true, showOnLeaderboards: true };

const denied = () => new GoalError("recordUnavailable", 404);
const pair = (a: string, b: string) => (a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a });
export const emailHash = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
/** "n•••@gmail.com" — what the sender typed, reduced; never derived from an account. */
export function maskEmail(email: string) {
  const [local, domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.min(3, Math.max(1, local.length - 1)))}@${domain}`;
}

export async function privacyOf(userIds: string[], db: Writer = getDb()): Promise<Map<string, SocialPrivacy>> {
  const map = new Map(userIds.map(id => [id, { ...DEFAULT_PRIVACY }]));
  if (!userIds.length) return map;
  const rows = await db.select().from(s.socialProfiles).where(inArray(s.socialProfiles.userId, userIds));
  for (const row of rows) map.set(row.userId, { acceptRequests: row.acceptRequests, activityVisibility: row.activityVisibility, shareSubjects: row.shareSubjects, shareStreak: row.shareStreak, showOnLeaderboards: row.showOnLeaderboards });
  return map;
}
export async function updatePrivacy(userId: string, value: SocialPrivacy) {
  await getDb().insert(s.socialProfiles).values({ userId, ...value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: s.socialProfiles.userId, set: { ...value, updatedAt: new Date() } });
  return value;
}

export async function friendIds(userId: string, db: Writer = getDb()): Promise<string[]> {
  const rows = await db.select({ low: s.friendships.userLow, high: s.friendships.userHigh }).from(s.friendships)
    .where(or(eq(s.friendships.userLow, userId), eq(s.friendships.userHigh, userId)));
  return rows.map(row => (row.low === userId ? row.high : row.low));
}
export async function areFriends(a: string, b: string, db: Writer = getDb()) {
  const [row] = await db.select({ low: s.friendships.userLow }).from(s.friendships).where(and(eq(s.friendships.userLow, pair(a, b).userLow), eq(s.friendships.userHigh, pair(a, b).userHigh)));
  return Boolean(row);
}
export async function isBlockedEitherWay(a: string, b: string, db: Writer = getDb()) {
  const [row] = await db.select({ id: s.userBlocks.blockerId }).from(s.userBlocks)
    .where(or(and(eq(s.userBlocks.blockerId, a), eq(s.userBlocks.blockedId, b)), and(eq(s.userBlocks.blockerId, b), eq(s.userBlocks.blockedId, a))));
  return Boolean(row);
}
async function shareGroup(a: string, b: string, db: Writer) {
  const rows = await db.execute<{ shared: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM study_group_members x JOIN study_group_members y ON y.group_id = x.group_id WHERE x.user_id = ${a}::uuid AND y.user_id = ${b}::uuid) AS shared`);
  return Boolean(rows.rows[0]?.shared);
}

/**
 * Whether `viewer` may see `owner`'s activity and limited history. Owners always
 * see their own; blocks always deny; otherwise the owner's visibility decides.
 */
export async function canSeeActivity(viewerId: string, ownerId: string, db: Writer = getDb()) {
  if (viewerId === ownerId) return true;
  if (await isBlockedEitherWay(viewerId, ownerId, db)) return false;
  const visibility = (await privacyOf([ownerId], db)).get(ownerId)!.activityVisibility;
  if (visibility === "private") return false;
  if (await areFriends(viewerId, ownerId, db)) return true;
  return visibility === "groups" && shareGroup(viewerId, ownerId, db);
}

async function notify(tx: Writer, userId: string, title: string, body: string, key: string) {
  await tx.insert(s.notifications).values({ userId, type: "circles", title, body, deduplicationKey: key, scheduledFor: new Date() }).onConflictDoNothing();
}

/**
 * Privacy-preserving friend request. The caller always gets the same outcome
 * ("sent") whether the address has no account, belongs to someone who does not
 * accept requests, has blocked the sender, is already a friend or already has a
 * pending request. Only the sender's own limits and self-requests are reported.
 */
export async function sendFriendRequest(senderId: string, email: string, copy: { title: (name: string) => string; body: string }) {
  const normalized = email.trim().toLowerCase();
  const db = getDb();
  return db.transaction(async tx => {
    const [sender] = await tx.select({ id: s.users.id, email: s.users.email, name: s.users.name }).from(s.users).where(eq(s.users.id, senderId)).for("update");
    if (!sender) throw denied();
    if (sender.email === normalized) throw new GoalError("cannotAddSelf", 400);
    if ((await friendIds(senderId, tx)).length >= LIMITS.friends) throw new GoalError("friendLimit", 409);
    const [invitation] = await tx.insert(s.friendInvitations).values({ senderId, emailHash: emailHash(normalized), maskedEmail: maskEmail(normalized) })
      .onConflictDoUpdate({ target: [s.friendInvitations.senderId, s.friendInvitations.emailHash], set: { createdAt: sql`${s.friendInvitations.createdAt}` } })
      .returning({ id: s.friendInvitations.id, requestId: s.friendInvitations.requestId });
    const [recipient] = await tx.select({ id: s.users.id }).from(s.users)
      .where(and(eq(s.users.email, normalized), eq(s.users.status, "active"), eq(s.users.role, "learner")));
    const deliverable = recipient
      && (await privacyOf([recipient.id], tx)).get(recipient.id)!.acceptRequests
      && !(await isBlockedEitherWay(senderId, recipient.id, tx))
      && !(await areFriends(senderId, recipient.id, tx));
    if (deliverable) {
      const [request] = await tx.insert(s.friendRequests).values({ senderId, recipientId: recipient.id }).onConflictDoNothing().returning({ id: s.friendRequests.id });
      if (request) {
        await tx.update(s.friendInvitations).set({ requestId: request.id }).where(eq(s.friendInvitations.id, invitation.id));
        await notify(tx, recipient.id, copy.title(sender.name), copy.body, `circles:request:${request.id}`);
      }
    }
    return { status: "sent" as const };
  });
}

export async function respondToRequest(userId: string, requestId: string, action: "accept" | "decline" | "block", copy: { acceptedTitle: (name: string) => string; acceptedBody: string }) {
  return getDb().transaction(async tx => {
    // Only the recipient can act; any other caller gets "not found".
    const [request] = await tx.select().from(s.friendRequests)
      .where(and(eq(s.friendRequests.id, requestId), eq(s.friendRequests.recipientId, userId), eq(s.friendRequests.status, "pending"))).for("update");
    if (!request) throw denied();
    if (action === "block") {
      await blockWithin(tx, userId, request.senderId);
      return { status: "blocked" as const };
    }
    if (action === "decline") {
      await tx.update(s.friendRequests).set({ status: "declined", respondedAt: new Date() }).where(eq(s.friendRequests.id, requestId));
      return { status: "declined" as const };
    }
    if (await isBlockedEitherWay(userId, request.senderId, tx)) throw denied();
    const [mine, theirs] = await Promise.all([friendIds(userId, tx), friendIds(request.senderId, tx)]);
    if (mine.length >= LIMITS.friends || theirs.length >= LIMITS.friends) throw new GoalError("friendLimit", 409);
    await tx.insert(s.friendships).values(pair(userId, request.senderId)).onConflictDoNothing();
    await tx.update(s.friendRequests).set({ status: "accepted", respondedAt: new Date() }).where(eq(s.friendRequests.id, requestId));
    const [me] = await tx.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId));
    await notify(tx, request.senderId, copy.acceptedTitle(me?.name ?? ""), copy.acceptedBody, `circles:accepted:${requestId}`);
    return { status: "accepted" as const };
  });
}

/** Withdraw a sent invitation; cancels the delivered request if there was one. */
export async function cancelInvitation(userId: string, invitationId: string) {
  return getDb().transaction(async tx => {
    const [invitation] = await tx.delete(s.friendInvitations).where(and(eq(s.friendInvitations.id, invitationId), eq(s.friendInvitations.senderId, userId))).returning();
    if (!invitation) throw denied();
    if (invitation.requestId) await tx.update(s.friendRequests).set({ status: "cancelled", respondedAt: new Date() })
      .where(and(eq(s.friendRequests.id, invitation.requestId), eq(s.friendRequests.senderId, userId), eq(s.friendRequests.status, "pending")));
    return { status: "cancelled" as const };
  });
}

export async function removeFriend(userId: string, friendId: string) {
  const removed = await getDb().delete(s.friendships).where(and(eq(s.friendships.userLow, pair(userId, friendId).userLow), eq(s.friendships.userHigh, pair(userId, friendId).userHigh))).returning();
  if (!removed.length) throw denied();
  return { status: "removed" as const };
}

/** Blocking ends the friendship and every pending request or invitation between the two. */
async function blockWithin(tx: Writer, blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new GoalError("invalidInput", 400);
  await tx.insert(s.userBlocks).values({ blockerId, blockedId }).onConflictDoNothing();
  await tx.delete(s.friendships).where(and(eq(s.friendships.userLow, pair(blockerId, blockedId).userLow), eq(s.friendships.userHigh, pair(blockerId, blockedId).userHigh)));
  await tx.update(s.friendRequests).set({ status: "declined", respondedAt: new Date() }).where(and(eq(s.friendRequests.status, "pending"),
    or(and(eq(s.friendRequests.senderId, blockerId), eq(s.friendRequests.recipientId, blockedId)), and(eq(s.friendRequests.senderId, blockedId), eq(s.friendRequests.recipientId, blockerId)))));
  await tx.update(s.studyGroupInvitations).set({ status: "cancelled", respondedAt: new Date() }).where(and(eq(s.studyGroupInvitations.status, "pending"),
    or(and(eq(s.studyGroupInvitations.inviterId, blockerId), eq(s.studyGroupInvitations.inviteeId, blockedId)), and(eq(s.studyGroupInvitations.inviterId, blockedId), eq(s.studyGroupInvitations.inviteeId, blockerId)))));
}
export async function blockUser(userId: string, targetId: string) {
  return getDb().transaction(async tx => { await blockWithin(tx, userId, targetId); return { status: "blocked" as const }; });
}
export async function unblockUser(userId: string, targetId: string) {
  await getDb().delete(s.userBlocks).where(and(eq(s.userBlocks.blockerId, userId), eq(s.userBlocks.blockedId, targetId)));
  return { status: "unblocked" as const };
}

/* ---------------------------------------------------------------- Groups */

export type GroupRole = "owner" | "admin" | "member";
async function membership(tx: Writer, groupId: string, userId: string) {
  const [row] = await tx.select({ role: s.studyGroupMembers.role }).from(s.studyGroupMembers).where(and(eq(s.studyGroupMembers.groupId, groupId), eq(s.studyGroupMembers.userId, userId)));
  return row?.role ?? null;
}
/** Members only; everyone else (including admins of other groups) gets "not found". */
export async function requireMember(groupId: string, userId: string, db: Writer = getDb()) {
  const role = await membership(db, groupId, userId);
  if (!role) throw denied();
  return role;
}
const manager = (role: GroupRole | null) => role === "owner" || role === "admin";

export async function createGroup(userId: string, input: { name: string; description: string; color: string }) {
  return getDb().transaction(async tx => {
    await tx.select({ id: s.users.id }).from(s.users).where(eq(s.users.id, userId)).for("update");
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.userId, userId));
    if (Number(count) >= LIMITS.groups) throw new GoalError("groupLimit", 409);
    const [group] = await tx.insert(s.studyGroups).values({ ...input, ownerId: userId }).returning();
    await tx.insert(s.studyGroupMembers).values({ groupId: group.id, userId, role: "owner" });
    return group;
  });
}
export async function updateGroup(userId: string, groupId: string, input: { name: string; description: string; color: string }) {
  return getDb().transaction(async tx => {
    if (!manager(await membership(tx, groupId, userId))) throw denied();
    const [group] = await tx.update(s.studyGroups).set({ ...input, updatedAt: new Date() }).where(eq(s.studyGroups.id, groupId)).returning();
    return group;
  });
}
export async function deleteGroup(userId: string, groupId: string) {
  return getDb().transaction(async tx => {
    if ((await membership(tx, groupId, userId)) !== "owner") throw denied();
    await tx.delete(s.studyGroups).where(eq(s.studyGroups.id, groupId));
    return { status: "deleted" as const };
  });
}

/** Owners and admins may invite their own friends; every invitation needs acceptance. */
export async function inviteToGroup(userId: string, groupId: string, inviteeIds: string[], copy: { title: (name: string, group: string) => string; body: string }) {
  return getDb().transaction(async tx => {
    if (!manager(await membership(tx, groupId, userId))) throw denied();
    const [group] = await tx.select().from(s.studyGroups).where(eq(s.studyGroups.id, groupId)).for("update");
    const friends = new Set(await friendIds(userId, tx));
    const members = new Set((await tx.select({ id: s.studyGroupMembers.userId }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.groupId, groupId))).map(row => row.id));
    const [{ pending }] = await tx.select({ pending: sql<number>`count(*)::int` }).from(s.studyGroupInvitations).where(and(eq(s.studyGroupInvitations.groupId, groupId), eq(s.studyGroupInvitations.status, "pending")));
    let room = LIMITS.groupMembers - members.size - Number(pending);
    if (room <= 0) throw new GoalError("groupFull", 409);
    const [inviter] = await tx.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId));
    let invited = 0;
    for (const inviteeId of [...new Set(inviteeIds)]) {
      // Silently skip anyone the inviter cannot invite; the response does not say why.
      if (!friends.has(inviteeId) || members.has(inviteeId) || room <= 0 || (await isBlockedEitherWay(userId, inviteeId, tx))) continue;
      const [invitation] = await tx.insert(s.studyGroupInvitations).values({ groupId, inviterId: userId, inviteeId }).onConflictDoNothing().returning({ id: s.studyGroupInvitations.id });
      if (!invitation) continue;
      room--; invited++;
      await notify(tx, inviteeId, copy.title(inviter?.name ?? "", group.name), copy.body, `circles:group-invite:${invitation.id}`);
    }
    return { invited };
  });
}

export async function respondToGroupInvitation(userId: string, invitationId: string, action: "accept" | "decline", copy: { title: (name: string, group: string) => string; body: string }) {
  return getDb().transaction(async tx => {
    const [invitation] = await tx.select().from(s.studyGroupInvitations)
      .where(and(eq(s.studyGroupInvitations.id, invitationId), eq(s.studyGroupInvitations.inviteeId, userId), eq(s.studyGroupInvitations.status, "pending"))).for("update");
    if (!invitation) throw denied();
    if (action === "decline") {
      await tx.update(s.studyGroupInvitations).set({ status: "declined", respondedAt: new Date() }).where(eq(s.studyGroupInvitations.id, invitationId));
      return { status: "declined" as const };
    }
    const [{ members }] = await tx.select({ members: sql<number>`count(*)::int` }).from(s.studyGroupMembers).where(eq(s.studyGroupMembers.groupId, invitation.groupId));
    if (Number(members) >= LIMITS.groupMembers) throw new GoalError("groupFull", 409);
    if (await isBlockedEitherWay(userId, invitation.inviterId, tx)) throw denied();
    await tx.insert(s.studyGroupMembers).values({ groupId: invitation.groupId, userId, role: "member" }).onConflictDoNothing();
    await tx.update(s.studyGroupInvitations).set({ status: "accepted", respondedAt: new Date() }).where(eq(s.studyGroupInvitations.id, invitationId));
    const [[me], [group]] = await Promise.all([
      tx.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, userId)),
      tx.select({ name: s.studyGroups.name }).from(s.studyGroups).where(eq(s.studyGroups.id, invitation.groupId)),
    ]);
    await notify(tx, invitation.inviterId, copy.title(me?.name ?? "", group?.name ?? ""), copy.body, `circles:group-joined:${invitationId}`);
    return { status: "accepted" as const, groupId: invitation.groupId };
  });
}

export async function leaveGroup(userId: string, groupId: string) {
  return getDb().transaction(async tx => {
    const role = await membership(tx, groupId, userId);
    if (!role) throw denied();
    // The owner hands the group over (or deletes it) instead of leaving it ownerless.
    if (role === "owner") throw new GoalError("ownerCannotLeave", 409);
    await tx.delete(s.studyGroupMembers).where(and(eq(s.studyGroupMembers.groupId, groupId), eq(s.studyGroupMembers.userId, userId)));
    return { status: "left" as const };
  });
}

/** Owners manage everyone; admins manage members only. Nobody can escalate to owner here. */
export async function manageMember(userId: string, groupId: string, memberId: string, action: "remove" | "makeAdmin" | "makeMember" | "transferOwnership") {
  return getDb().transaction(async tx => {
    const [actorRole, targetRole] = await Promise.all([membership(tx, groupId, userId), membership(tx, groupId, memberId)]);
    if (!manager(actorRole) || !targetRole || memberId === userId) throw denied();
    if (targetRole === "owner" || (actorRole === "admin" && (targetRole === "admin" || action !== "remove"))) throw denied();
    const where = and(eq(s.studyGroupMembers.groupId, groupId), eq(s.studyGroupMembers.userId, memberId));
    if (action === "remove") await tx.delete(s.studyGroupMembers).where(where);
    else if (action === "transferOwnership") {
      if (actorRole !== "owner") throw denied();
      await tx.update(s.studyGroupMembers).set({ role: "admin" }).where(and(eq(s.studyGroupMembers.groupId, groupId), eq(s.studyGroupMembers.userId, userId)));
      await tx.update(s.studyGroupMembers).set({ role: "owner" }).where(where);
      await tx.update(s.studyGroups).set({ ownerId: memberId, updatedAt: new Date() }).where(eq(s.studyGroups.id, groupId));
    } else await tx.update(s.studyGroupMembers).set({ role: action === "makeAdmin" ? "admin" : "member" }).where(where);
    return { status: "updated" as const };
  });
}

export async function myGroups(userId: string) {
  return getDb().select({ id: s.studyGroups.id, name: s.studyGroups.name, description: s.studyGroups.description, color: s.studyGroups.color, role: s.studyGroupMembers.role,
    members: sql<number>`(SELECT count(*)::int FROM study_group_members m WHERE m.group_id = ${s.studyGroups.id})` })
    .from(s.studyGroupMembers).innerJoin(s.studyGroups, eq(s.studyGroups.id, s.studyGroupMembers.groupId))
    .where(eq(s.studyGroupMembers.userId, userId)).orderBy(desc(s.studyGroups.updatedAt));
}
