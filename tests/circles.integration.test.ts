/**
 * Study Circles end to end against a real Postgres (an isolated Neon branch):
 * set TEST_DATABASE_URL and TEST_DATABASE_ISOLATED=true, after running migrations.
 * Fixtures use a 2020 competition week so no real week is ever finalized.
 * Covers the brief's tests A-L and N-O at the service and database level.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => { void task(); } }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en", getTranslations: async () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ redirect: () => { throw new Error("unauthorized redirect"); } }));
vi.mock("@/lib/cache", async importOriginal => ({ ...(await importOriginal<object>()), invalidateUser: async () => {}, invalidateSettings: async () => {} }));

const enabled = Boolean(process.env.TEST_DATABASE_URL) && process.env.TEST_DATABASE_ISOLATED === "true";
const copy = { title: (name: string) => `${name} sent a request`, body: "body" };
const accepted = { acceptedTitle: (name: string) => `${name} accepted`, acceptedBody: "body" };
const groupCopy = { title: (name: string, group: string) => `${name} ${group}`, body: "body" };

describe.skipIf(!enabled)("Study Circles on an isolated database", { timeout: 240_000 }, () => {
  let db: ReturnType<typeof import("@/lib/db").getDb>;
  let s: typeof import("@/lib/db/schema");
  let mutate: typeof import("@/lib/services/mutations").mutate;
  let social: typeof import("@/lib/circles/social");
  let board: typeof import("@/lib/circles/leaderboard");
  let tracking: typeof import("@/lib/circles/tracking");
  let competition: typeof import("@/lib/circles/competition");
  const run = crypto.randomUUID().slice(0, 8);
  const ids = Array.from({ length: 12 }, () => crypto.randomUUID());
  const [a, b, c, admin] = ids;
  const subjects = new Map<string, string>();
  const email = (id: string) => `circles-${run}-${id.slice(0, 8)}@example.com`;
  const at = (iso: string) => { vi.setSystemTime(new Date(iso)); return new Date(iso); };
  const timer = (userId: string, command: "start" | "pause" | "resume" | "finish") =>
    mutate(userId, [{ kind: "timer", value: command === "start" ? { command, subjectId: subjects.get(userId)! } : { command } } as never]);

  beforeAll(async () => {
    Object.assign(process.env, { DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL });
    vi.useFakeTimers({ toFake: ["Date"] });
    db = (await import("@/lib/db")).getDb(); s = await import("@/lib/db/schema");
    mutate = (await import("@/lib/services/mutations")).mutate;
    social = await import("@/lib/circles/social"); board = await import("@/lib/circles/leaderboard");
    tracking = await import("@/lib/circles/tracking"); competition = await import("@/lib/circles/competition");
    await db.insert(s.users).values(ids.map((id, index) => ({ id, email: email(id), name: `Student ${String(index).padStart(2, "0")}`, emailVerified: true, role: id === admin ? "super_admin" as const : "learner" as const, acceptedTermsAt: new Date(), onboardingCompletedAt: new Date() })));
    for (const id of ids) {
      const subject = crypto.randomUUID();
      subjects.set(id, subject);
      await db.insert(s.subjects).values({ id: subject, userId: id, title: `Private subject ${id.slice(0, 4)}` });
    }
  });
  afterAll(async () => {
    vi.useRealTimers();
    await db.delete(s.users).where(inArray(s.users.id, ids));
    // Shared row: the past test week this suite finalized.
    await db.delete(s.competitionWeeks).where(eq(s.competitionWeeks.weekStart, "2020-11-02"));
  });

  it("A: a request persists, notifies, and acceptance makes one friendship", async () => {
    expect(await social.sendFriendRequest(a, email(b), copy)).toEqual({ status: "sent" });
    const [request] = await db.select().from(s.friendRequests).where(and(eq(s.friendRequests.senderId, a), eq(s.friendRequests.recipientId, b)));
    expect(request.status).toBe("pending");
    expect(await db.select().from(s.notifications).where(and(eq(s.notifications.userId, b), eq(s.notifications.type, "circles")))).toHaveLength(1);
    // A second send and a reverse send cannot create another pending request.
    await social.sendFriendRequest(a, email(b), copy);
    await social.sendFriendRequest(b, email(a), copy);
    expect(await db.select().from(s.friendRequests).where(inArray(s.friendRequests.senderId, [a, b]))).toHaveLength(1);
    await social.respondToRequest(b, request.id, "accept", accepted);
    expect(await social.areFriends(a, b)).toBe(true);
    expect(await db.select().from(s.friendships).where(inArray(s.friendships.userLow, [a, b]))).toHaveLength(1);
  });

  it("does not reveal whether an address has an account", async () => {
    const results = await Promise.all([social.sendFriendRequest(c, `nobody-${run}@example.com`, copy), social.sendFriendRequest(c, email(a), copy)]);
    expect(results[0]).toEqual(results[1]);
    const outgoing = await board.requests(c);
    expect(outgoing.outgoing.map(row => row.maskedEmail).sort()).toEqual([`n•••@example.com`, `c•••@example.com`].sort());
    await expect(social.sendFriendRequest(c, email(c), copy)).rejects.toMatchObject({ message: "cannotAddSelf" });
  });

  it("B: someone else cannot accept a request meant for another user", async () => {
    const [request] = await db.select().from(s.friendRequests).where(and(eq(s.friendRequests.senderId, c), eq(s.friendRequests.recipientId, a)));
    await expect(social.respondToRequest(b, request.id, "accept", accepted)).rejects.toMatchObject({ status: 404 });
    expect(await social.areFriends(c, a)).toBe(false);
  });

  it("C: private history is denied to non-friends and to friends when set private", async () => {
    await expect(board.friendHistory(c, b)).rejects.toMatchObject({ status: 404 });
    await social.updatePrivacy(b, { ...social.DEFAULT_PRIVACY, activityVisibility: "private" });
    await expect(board.friendHistory(a, b)).rejects.toMatchObject({ status: 404 });
    await social.updatePrivacy(b, social.DEFAULT_PRIVACY);
    await expect(board.friendHistory(a, b)).resolves.toMatchObject({ shareSubjects: false });
  });

  it("D/G: start-pause-resume-finish credits active time once, and replays add nothing", async () => {
    at("2020-11-03T03:00:00Z"); await timer(a, "start");
    for (const minute of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) { at(new Date(Date.parse("2020-11-03T03:00:00Z") + minute * 60_000).toISOString()); await tracking.recordHeartbeat(a); }
    at("2020-11-03T03:10:00Z"); await timer(a, "pause");
    at("2020-11-03T03:40:00Z"); await timer(a, "resume");
    for (const minute of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) { at(new Date(Date.parse("2020-11-03T03:40:00Z") + minute * 60_000).toISOString()); await tracking.recordHeartbeat(a); }
    at("2020-11-03T04:00:00Z"); await timer(a, "finish");
    const [score] = await db.select().from(s.weeklyScores).where(and(eq(s.weeklyScores.userId, a), eq(s.weeklyScores.weekStart, "2020-11-02")));
    expect(score.creditedSeconds).toBe(30 * 60);
    await expect(timer(a, "finish")).rejects.toMatchObject({ message: "recordUnavailable" });
    const [again] = await db.select().from(s.weeklyScores).where(and(eq(s.weeklyScores.userId, a), eq(s.weeklyScores.weekStart, "2020-11-02")));
    expect(again.creditedSeconds).toBe(30 * 60);
  });

  it("E/L: fabricated or manual durations never reach the leaderboard", async () => {
    // A "session" edit claiming 20 hours is stored as manual time only.
    await mutate(b, [{ kind: "session", value: { id: crypto.randomUUID(), subjectId: subjects.get(b)!, startedAt: "2020-11-03T00:00:00Z", endedAt: "2020-11-03T20:00:00Z", durationSeconds: 72000 } } as never]);
    const before = await board.friendsLeaderboard(a, "2020-11-02");
    expect(before.rows.find(row => row.userId === b)?.seconds).toBe(0);
    expect((await board.studyHistory(b, "2020-11-02")).manual).toHaveLength(1);
  });

  it("F: a second device cannot start an overlapping timer", async () => {
    at("2020-11-04T03:00:00Z"); await timer(b, "start");
    await expect(timer(b, "start")).rejects.toMatchObject({ message: "timerAlreadyRunning" });
    at("2020-11-04T03:01:00Z"); await tracking.recordHeartbeat(b);
    at("2020-11-04T03:01:30Z"); await timer(b, "finish");
  });

  it("N: a client that goes silent stops earning at its last heartbeat plus grace", async () => {
    at("2020-11-05T03:00:00Z"); await timer(c, "start");
    for (const minute of [1, 2, 3, 4, 5]) { at(new Date(Date.parse("2020-11-05T03:00:00Z") + minute * 60_000).toISOString()); await tracking.recordHeartbeat(c); }
    at("2020-11-05T05:00:00Z"); await timer(c, "finish");
    const [score] = await db.select().from(s.weeklyScores).where(and(eq(s.weeklyScores.userId, c), eq(s.weeklyScores.weekStart, "2020-11-02")));
    expect(score.creditedSeconds).toBe(5 * 60 + 90);
  });

  it("H/I/J/K: group ranking with ties, one finalization, and member-only access", async () => {
    const group = await social.createGroup(a, { name: `Squad ${run}`, description: "", color: "brand" });
    for (const id of ids.slice(1, 10)) {
      if (!(await social.areFriends(a, id))) {
        await social.sendFriendRequest(a, email(id), copy);
        const [request] = await db.select().from(s.friendRequests).where(and(eq(s.friendRequests.senderId, a), eq(s.friendRequests.recipientId, id), eq(s.friendRequests.status, "pending")));
        if (request) await social.respondToRequest(id, request.id, "accept", accepted);
      }
    }
    await social.inviteToGroup(a, group.id, ids.slice(1, 10).filter(id => id !== admin), groupCopy);
    for (const invitation of await db.select().from(s.studyGroupInvitations).where(eq(s.studyGroupInvitations.groupId, group.id))) await social.respondToGroupInvitation(invitation.inviteeId, invitation.id, "accept", groupCopy);
    // Give the two newest members the same verified time as the leader to make a tie.
    const tieA = ids[4], tieB = ids[5];
    await db.insert(s.weeklyScores).values([{ userId: tieA, weekStart: "2020-11-02", creditedSeconds: 1800 }, { userId: tieB, weekStart: "2020-11-02", creditedSeconds: 1800 }]).onConflictDoNothing();
    const live = await board.groupLeaderboard(a, group.id, "2020-11-02");
    expect(live.rows.filter(row => row.rank === 1).map(row => row.userId).sort()).toEqual([a, tieA, tieB].sort());
    expect(live.rows[3].rank).toBe(4);
    await expect(board.groupLeaderboard(admin, group.id, "2020-11-02")).rejects.toMatchObject({ status: 404 });
    expect(await competition.finalizeWeek("2020-11-02", new Date("2020-11-10T00:00:00Z"))).toBe(true);
    expect(await competition.finalizeWeek("2020-11-02", new Date("2020-11-10T00:00:00Z"))).toBe(false);
    const winners = await db.select().from(s.notifications).where(and(eq(s.notifications.userId, a), eq(s.notifications.deduplicationKey, `circles:winner:${group.id}:2020-11-02`)));
    expect(winners).toHaveLength(1);
    expect((await board.groupHistory(a, group.id))[0].winners).toHaveLength(3);
    // Late credit for a finalized week is recorded but not counted.
    at("2020-11-08T17:00:00Z"); await timer(ids[6], "start");
    at("2020-11-08T17:01:00Z"); await tracking.recordHeartbeat(ids[6]);
    at("2020-11-08T17:02:00Z"); await tracking.recordHeartbeat(ids[6]);
    at("2020-11-10T01:00:00Z"); await timer(ids[6], "finish");
    const [late] = await db.select().from(s.verifiedStudyIntervals).where(eq(s.verifiedStudyIntervals.userId, ids[6]));
    expect(late).toMatchObject({ creditedSeconds: 0, exclusionReason: "weekFinalized" });
  });

  it("O: only an administrator can correct a score, with a recorded reason, and history re-ranks", async () => {
    const [piece] = await db.select().from(s.verifiedStudyIntervals).where(and(eq(s.verifiedStudyIntervals.userId, a), eq(s.verifiedStudyIntervals.weekStart, "2020-11-02")));
    await expect(competition.correctInterval(b, piece.id, "invalidate", "testing")).rejects.toMatchObject({ status: 404 });
    await competition.correctInterval(admin, piece.id, "invalidate", "Duplicate device session");
    const [audit] = await db.select().from(s.scoreAdjustments).where(eq(s.scoreAdjustments.intervalId, piece.id));
    expect(audit).toMatchObject({ actorUserId: admin, reason: "Duplicate device session", afterSeconds: 0 });
    const [result] = await db.select().from(s.groupWeekResults).where(and(eq(s.groupWeekResults.userId, a), eq(s.groupWeekResults.weekStart, "2020-11-02")));
    expect(result.correctedAt).not.toBeNull();
    expect(result.rank).toBeGreaterThan(1);
    expect(await competition.reconcileWeeklyScores(a)).toMatchObject({ changed: 0 });
  });

  it("the feed and overview load for a user with friends and show only visible people", async () => {
    const feed = await board.activityFeed(a);
    expect(feed.some(item => item.me && item.kind === "session")).toBe(true);
    // Everyone uses the default "friends" visibility, so only friends may appear.
    const friends = new Set(await social.friendIds(a));
    expect(feed.every(item => item.me || friends.has(item.userId))).toBe(true);
    const summary = await board.overview(a);
    expect(summary.me.userId).toBe(a);
    expect(summary.feed.length).toBeGreaterThan(0);
  });
});
