import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("Unexpected fixture redirect");
  },
}));
const enabled =
  Boolean(process.env.TEST_DATABASE_URL) &&
  (process.env.TEST_DATABASE_ISOLATED === "true" ||
    process.env.TEST_DATABASE_FIXTURES_ONLY === "true");
if (enabled) vi.setConfig({ testTimeout: 120000, hookTimeout: 60000 });
describe.skipIf(!enabled)("Aven mentions on disposable owned database fixtures", () => {
  let db: ReturnType<typeof import("@/lib/db").getDb>,
    s: typeof import("@/lib/db/schema"),
    mentions: typeof import("@/lib/aven/mentions");
  const [owner, friend, blockedFriend, stranger] = Array.from({ length: 4 }, () => crypto.randomUUID());
  const ownSubject = crypto.randomUUID(),
    ownTwin = crypto.randomUUID(),
    strangerSubject = crypto.randomUUID(),
    group = crypto.randomUUID(),
    otherGroup = crypto.randomUUID(),
    goal = crypto.randomUUID();
  const pair = (a: string, b: string) => (a < b ? { userLow: a, userHigh: b } : { userLow: b, userHigh: a });
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
    db = (await import("@/lib/db")).getDb();
    s = await import("@/lib/db/schema");
    mentions = await import("@/lib/aven/mentions");
    await db.insert(s.users).values(
      [owner, friend, blockedFriend, stranger].map((id, index) => ({
        id,
        name: ["Owner", "Maya Friend", "Blocked Friend", "Stranger"][index],
        email: `${id}@example.com`,
        acceptedTermsAt: new Date(),
      })),
    );
    await db.insert(s.subjects).values([
      { id: ownSubject, userId: owner, title: "Advanced Java" },
      { id: ownTwin, userId: owner, title: "Advanced Java", status: "archived" },
      { id: strangerSubject, userId: stranger, title: "Advanced Java" },
    ]);
    const { goalSchema } = await import("@/lib/goals/validation");
    const value = goalSchema.parse({ title: "Backend developer", startDate: "2026-10-01", targetDate: "2026-12-31" });
    await db.insert(s.goals).values({
      id: goal, userId: owner, title: value.title, category: value.category,
      startDate: value.startDate, targetDate: value.targetDate, progressConfig: value.progressConfig,
    });
    await db.insert(s.friendships).values([pair(owner, friend), pair(owner, blockedFriend)]);
    await db.insert(s.userBlocks).values({ blockerId: blockedFriend, blockedId: owner });
    await db.insert(s.studyGroups).values([
      { id: group, name: "Java Circle", ownerId: owner },
      { id: otherGroup, name: "Java Secret Circle", ownerId: stranger },
    ]);
    await db.insert(s.studyGroupMembers).values([
      { groupId: group, userId: owner, role: "owner" },
      { groupId: otherGroup, userId: stranger, role: "owner" },
    ]);
  });
  afterAll(async () => {
    if (db && s) await db.delete(s.users).where(inArray(s.users.id, [owner, friend, blockedFriend, stranger]));
  });
  it("searches only the owner's records and tells duplicate names apart", async () => {
    const result = await mentions.searchMentions(owner, "advanced");
    const subjects = result.items.filter((item) => item.type === "subject");
    expect(subjects.map((item) => item.id).sort()).toEqual([ownSubject, ownTwin].sort());
    expect(new Set(subjects.map((item) => item.detail))).toEqual(new Set(["active", "archived"]));
    expect(result.items.some((item) => item.id === strangerSubject)).toBe(false);
  });
  it("treats wildcard characters as text", async () => {
    expect((await mentions.searchMentions(owner, "%")).items).toEqual([]);
  });
  it("rejects other accounts' records and unknown IDs as unavailable", async () => {
    const result = await mentions.resolveMentions(owner, [
      { type: "subject", id: ownSubject },
      { type: "subject", id: strangerSubject },
      { type: "goal", id: crypto.randomUUID() },
      { type: "circle", id: otherGroup },
    ]);
    expect(result.resolved.map((item) => item.id)).toEqual([ownSubject]);
    expect(result.unavailable).toHaveLength(3);
  });
  it("enforces friendship, blocks and group membership", async () => {
    const people = await mentions.searchMentions(owner, "", { types: ["friend", "circle"] });
    expect(people.items.map((item) => item.id).sort()).toEqual([friend, group].sort());
    const resolved = await mentions.resolveMentions(owner, [
      { type: "friend", id: friend },
      { type: "friend", id: blockedFriend },
      { type: "friend", id: stranger },
    ]);
    expect(resolved.resolved.map((item) => item.id)).toEqual([friend]);
    // The stranger cannot mention the owner either.
    expect((await mentions.resolveMentions(stranger, [{ type: "friend", id: owner }])).resolved).toEqual([]);
  });
  it("turns a deleted record into an unavailable reference", async () => {
    await db.delete(s.goals).where(eq(s.goals.id, goal));
    const result = await mentions.resolveMentions(owner, [{ type: "goal", id: goal }]);
    expect(result).toEqual({ resolved: [], unavailable: [{ type: "goal", id: goal }] });
  });
});
