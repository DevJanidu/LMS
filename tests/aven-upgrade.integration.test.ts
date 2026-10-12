import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
} from "@/lib/aven/validation";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { randomCheckInTime } from "@/lib/aven/scheduler-model";
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    createTranslator({
      locale: "en",
      messages: en,
      namespace: namespace as "aven.notifications",
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: () => {
    throw new Error("Unexpected redirect");
  },
}));
const enabled =
  Boolean(process.env.TEST_DATABASE_URL) &&
  process.env.TEST_DATABASE_FIXTURES_ONLY === "true";
describe.skipIf(!enabled)(
  "Aven upgrade on disposable real database fixtures",
  () => {
    let db: ReturnType<typeof import("@/lib/db").getDb>,
      s: typeof import("@/lib/db/schema"),
      conversations: typeof import("@/lib/aven/conversations"),
      proposals: typeof import("@/lib/aven/proposals"),
      tools: typeof import("@/lib/aven/tools");
    const a = crypto.randomUUID(),
      b = crypto.randomUUID(),
      subject = crypto.randomUUID(),
      otherSubject = crypto.randomUUID(),
      topic = crypto.randomUUID(),
      thread = crypto.randomUUID();
    const timezone = "Asia/Colombo",
      today = localDay(Date.now(), timezone),
      tomorrow = shiftDay(today, 1);
    const instant = (hour: string) =>
      zonedToUtc(`${tomorrow}T${hour}`, timezone);
    const tool = (name: string, args: unknown) =>
      tools.executeAvenTool(a, thread, name, args) as Promise<{
        id: string;
        value: unknown;
      }>;
    const createBlock = async (
      title: string,
      startsAt: string,
      endsAt: string,
    ) =>
      (
        await db
          .insert(s.scheduleBlocks)
          .values({
            userId: a,
            subjectId: subject,
            title,
            startsAt: new Date(startsAt),
            endsAt: new Date(endsAt),
            timezone,
            displayColor: "orange",
          })
          .returning()
      )[0];
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
      db = (await import("@/lib/db")).getDb();
      s = await import("@/lib/db/schema");
      conversations = await import("@/lib/aven/conversations");
      proposals = await import("@/lib/aven/proposals");
      tools = await import("@/lib/aven/tools");
      await db.insert(s.users).values([
        {
          id: a,
          name: "Upgrade fixture",
          email: `${a}@example.com`,
          timezone,
          timezoneMode: "manual",
          acceptedTermsAt: new Date(),
        },
        {
          id: b,
          name: "Other fixture",
          email: `${b}@example.com`,
          acceptedTermsAt: new Date(),
        },
      ]);
      await db.insert(s.preferences).values({ userId: a });
      await db.insert(s.subjects).values([
        { id: subject, userId: a, title: "Java", displayColor: "orange" },
        { id: otherSubject, userId: b, title: "Private" },
      ]);
      await db
        .insert(s.topics)
        .values({ id: topic, subjectId: subject, title: "Java basics" });
      await db
        .insert(s.aiConversations)
        .values({ id: thread, userId: a, title: "Upgrade fixture" });
      await db.insert(s.aiUserPreferences).values({
        userId: a,
        value: aiPreferenceSchema.parse({
          consent: true,
          onboardingComplete: true,
        }),
      });
    }, 60000);
    afterAll(async () => {
      if (db && s) {
        await db
          .delete(s.auditLogs)
          .where(inArray(s.auditLogs.actorUserId, [a, b]));
        await db.delete(s.users).where(inArray(s.users.id, [a, b]));
      }
    }, 60000);
    it("retries without another user row, fences successful replay and rejects another account", async () => {
      const request = crypto.randomUUID();
      const turn = await conversations.beginConversationTurn(
        a,
        null,
        null,
        request,
        "Help with Java",
      );
      await conversations.finishConversationTurn(
        a,
        turn.id,
        request,
        "aiUnavailable",
        "error",
      );
      const retry = crypto.randomUUID();
      await conversations.beginConversationTurn(
        a,
        turn.id,
        null,
        retry,
        "Help with Java",
        request,
      );
      await conversations.finishConversationTurn(
        a,
        turn.id,
        retry,
        "Persisted answer",
        "complete",
      );
      const history = await conversations.getConversation(a, turn.id);
      expect(
        history.messages.filter((item) => item.role === "user"),
      ).toHaveLength(1);
      await expect(
        conversations.beginConversationTurn(
          a,
          turn.id,
          null,
          crypto.randomUUID(),
          "Help with Java",
          request,
        ),
      ).rejects.toMatchObject({ message: "alreadyAnswered" });
      await expect(
        conversations.beginConversationTurn(
          a,
          turn.id,
          null,
          crypto.randomUUID(),
          "Help with Java",
          retry,
        ),
      ).rejects.toMatchObject({ message: "invalidInput" });
      await expect(
        conversations.getConversation(b, turn.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        conversations.recoverRequestConversation(b, request),
      ).resolves.toEqual({ found: false });
    }, 60000);
    it("regenerates only the latest reply, supersedes it, and supports rename, search and stopped partial text", async () => {
      const first = crypto.randomUUID();
      const turn = await conversations.beginConversationTurn(
        a,
        null,
        null,
        first,
        "Plan my Java week",
      );
      await conversations.finishConversationTurn(
        a,
        turn.id,
        first,
        "Original plan",
        "complete",
      );
      const regenerate = crypto.randomUUID();
      const replay = await conversations.beginConversationTurn(
        a,
        turn.id,
        null,
        regenerate,
        "Plan my Java week",
        first,
        true,
      );
      expect(replay.history.map((item) => item.content)).toEqual([
        "Plan my Java week",
      ]);
      await conversations.finishConversationTurn(
        a,
        turn.id,
        regenerate,
        "Better plan",
        "complete",
      );
      const saved = await conversations.getConversation(a, turn.id);
      expect(
        saved.messages
          .filter((item) => item.role === "assistant")
          .map((item) => [item.content, item.status]),
      ).toEqual([
        ["Original plan", "superseded"],
        ["Better plan", "complete"],
      ]);
      const second = crypto.randomUUID();
      await conversations.beginConversationTurn(
        a,
        turn.id,
        null,
        second,
        "And next week?",
      );
      await conversations.finishConversationTurn(
        a,
        turn.id,
        second,
        "generationStopped",
        "cancelled",
      );
      await conversations.keepStoppedAnswer(
        a,
        turn.id,
        second,
        "Partial reply",
      );
      await conversations.keepStoppedAnswer(b, turn.id, second, "Injected");
      expect(
        (await conversations.getConversation(a, turn.id)).messages.at(-1)
          ?.content,
      ).toBe("Partial reply");
      await expect(
        conversations.beginConversationTurn(
          a,
          turn.id,
          null,
          crypto.randomUUID(),
          "Plan my Java week",
          first,
          true,
        ),
      ).rejects.toMatchObject({ message: "invalidInput" });
      const preferences = await import("@/lib/aven/preferences");
      await preferences.changeAvenPreferences(a, {
        kind: "renameConversation",
        id: turn.id,
        title: "Java weekly plan",
      });
      await expect(
        preferences.changeAvenPreferences(b, {
          kind: "renameConversation",
          id: turn.id,
          title: "Taken",
        }),
      ).rejects.toMatchObject({ status: 404 });
      const found = await conversations.listConversations(
        a,
        undefined,
        "weekly",
      );
      expect(found.conversations.map((item) => item.title)).toContain(
        "Java weekly plan",
      );
      expect(
        (await conversations.listConversations(a, undefined, "100%_"))
          .conversations,
      ).toEqual([]);
    }, 60000);
    it("persists cancellation, releases the lease, and prevents a stale completion", async () => {
      const request = crypto.randomUUID();
      const turn = await conversations.beginConversationTurn(
        a,
        null,
        null,
        request,
        "Explain Java",
      );
      expect(
        await conversations.finishConversationTurn(
          a,
          turn.id,
          request,
          "generationStopped",
          "cancelled",
        ),
      ).toBe(true);
      expect(
        await conversations.finishConversationTurn(
          a,
          turn.id,
          request,
          "Late answer",
          "complete",
        ),
      ).toBe(false);
      const history = await conversations.getConversation(a, turn.id);
      expect(history.messages.at(-1)?.status).toBe("cancelled");
      expect(history.conversation.activeRequestId).toBeNull();
    }, 60000);
    it("moves two sessions atomically with duration/color preservation, and rejects stale/overlapping batches", async () => {
      const first = await createBlock(
          "Spring",
          instant("10:00"),
          instant("11:00"),
        ),
        second = await createBlock(
          "Docker",
          instant("15:00"),
          instant("16:00"),
        );
      const pending = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: first.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T09:30`,
            scope: "one",
          },
          {
            blockId: second.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T10:30`,
            scope: "one",
          },
        ],
        explanation: "Move both",
      });
      const result = await proposals.resolveProposal(a, pending.id, "approve");
      expect(result.status).toBe("approved");
      const read = (await tools.executeAvenTool(a, thread, "getCalendar", {
        from: tomorrow,
        to: tomorrow,
      })) as { total: number; sessions: { localStartsAt: string }[] };
      expect(read.total).toBe(2);
      expect(
        read.sessions.some(
          (item) => item.localStartsAt === `${tomorrow}T09:30`,
        ),
      ).toBe(true);
      const rows = await db
        .select()
        .from(s.scheduleBlocks)
        .where(inArray(s.scheduleBlocks.id, [first.id, second.id]));
      expect(
        rows.every(
          (item) =>
            item.endsAt.getTime() - item.startsAt.getTime() === 3600000 &&
            item.displayColor === "orange",
        ),
      ).toBe(true);
      expect(
        rows.find((item) => item.id === first.id)?.startsAt.toISOString(),
      ).toBe(instant("09:30"));
      expect(
        (await proposals.resolveProposal(a, pending.id, "approve")).status,
      ).toBe("approved");
      expect(
        (await proposals.resolveProposal(a, pending.id, "undo")).status,
      ).toBe("undone");
      const restored = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.id, first.id));
      expect(restored[0].startsAt.toISOString()).toBe(instant("10:00"));
      const again = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: first.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T09:30`,
            scope: "one",
          },
          {
            blockId: second.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T10:30`,
            scope: "one",
          },
        ],
        explanation: "Move both again",
      });
      await proposals.resolveProposal(a, again.id, "approve");
      const overlap = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: first.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T12:00`,
            scope: "one",
          },
          {
            blockId: second.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T12:30`,
            scope: "one",
          },
        ],
        explanation: "Overlap",
      });
      await expect(
        proposals.resolveProposal(a, overlap.id, "approve"),
      ).rejects.toMatchObject({ message: "scheduleOverlap" });
      const unchanged = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.id, first.id));
      expect(unchanged[0].startsAt.toISOString()).toBe(instant("09:30"));
      const stale = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: first.id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T12:00`,
            scope: "one",
          },
        ],
        explanation: "Stale",
      });
      await db
        .update(s.scheduleBlocks)
        .set({ updatedAt: new Date(Date.now() + 1000) })
        .where(eq(s.scheduleBlocks.id, first.id));
      await expect(
        proposals.resolveProposal(a, stale.id, "approve"),
      ).rejects.toMatchObject({ message: "conflict" });
      await expect(
        proposals.resolveProposal(b, pending.id, "approve"),
      ).rejects.toMatchObject({ status: 404 });
    }, 120000);
    it("creates an ongoing recurring schedule and cancels one occurrence with an owned approved proposal", async () => {
      const pending = await tool("createStudySchedule", {
        title: "Evening Java",
        subjectId: subject,
        subjectName: null,
        topicId: topic,
        localStartsAt: `${tomorrow}T18:00`,
        durationMinutes: 60,
        repeat: "weekly",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        until: null,
        skipConflicts: false,
        explanation: "Daily practice",
      });
      const saved = await proposals.resolveProposal(a, pending.id, "approve");
      const id = saved.result?.blockIds?.[0];
      expect(id).toBeTruthy();
      const [row] = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.id, id!));
      expect(row.recurrenceRule?.weekdays).toHaveLength(7);
      expect(row.displayColor).toBe("orange");
      const cancel = await tool("cancelStudySessions", {
        sessions: [{ blockId: id, date: tomorrow, scope: "one" }],
        explanation: "Skip tomorrow",
      });
      await proposals.resolveProposal(a, cancel.id, "approve");
      const [exception] = await db
        .select()
        .from(s.scheduleExceptions)
        .where(
          and(
            eq(s.scheduleExceptions.blockId, id!),
            eq(s.scheduleExceptions.date, tomorrow),
          ),
        );
      expect(exception.isCancelled).toBe(true);
      const [series] = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.id, id!));
      expect(series).toBeTruthy();
    }, 120000);
    it("decomposes, revises and saves a goal hierarchy once, then ranks its next action", async () => {
      const plan = (title: string, milestones: string[]) => ({
        goalId: null,
        title,
        description: "",
        category: "career",
        targetDate: shiftDay(today, 60),
        successCriteria: "Offer received",
        assumptions: [],
        allowDuplicate: false,
        milestones: milestones.map((name, index) => ({
          title: name,
          description: "",
          successCriteria: "",
          estimatedHours: 10,
          dueDate: null,
          dependsOn: index ? [index] : [],
          subjectName: "java",
          tasks: [
            {
              title: `Learn ${name}`,
              description: "",
              estimatedMinutes: 60,
              dueDate: null,
              dependsOnPrevious: false,
            },
            {
              title: `Practise ${name}`,
              description: "",
              estimatedMinutes: 60,
              dueDate: null,
              dependsOnPrevious: true,
            },
          ],
        })),
      });
      const draft = await tool(
        "proposeGoalHierarchy",
        plan("Become a backend engineer", ["Core Java", "Spring Boot"]),
      );
      const revised = await tool(
        "proposeGoalHierarchy",
        plan("Become a backend engineer", [
          "Core Java",
          "Spring Boot",
          "Docker",
        ]),
      );
      const [old] = await db
        .select({ status: s.aiPlanProposals.status })
        .from(s.aiPlanProposals)
        .where(eq(s.aiPlanProposals.id, draft.id));
      expect(old.status).toBe("superseded");
      expect(
        (await proposals.resolveProposal(a, draft.id, "approve")).status,
      ).toBe("superseded");
      const saved = await proposals.resolveProposal(a, revised.id, "approve");
      const goalId = saved.result?.goalId;
      expect(goalId).toBeTruthy();
      // A retried approval returns the stored result instead of saving again.
      expect(
        (await proposals.resolveProposal(a, revised.id, "approve")).result
          ?.goalId,
      ).toBe(goalId);
      const milestones = await db
        .select()
        .from(s.goalMilestones)
        .where(eq(s.goalMilestones.goalId, goalId!));
      const tasks = await db
        .select()
        .from(s.goalTasks)
        .where(eq(s.goalTasks.goalId, goalId!));
      expect(milestones).toHaveLength(3);
      expect(tasks).toHaveLength(6);
      expect(tasks.every((task) => task.subjectId === subject)).toBe(true);
      expect(
        milestones.find((m) => m.title === "Docker")?.dependencyIds,
      ).toEqual([milestones.find((m) => m.title === "Spring Boot")!.id]);
      const duplicate = (await tool(
        "proposeGoalHierarchy",
        plan("Become backend engineer", ["Core Java"]),
      )) as unknown as { proposalCreated: boolean; duplicates: unknown[] };
      expect(duplicate.proposalCreated).toBe(false);
      expect(duplicate.duplicates).toHaveLength(1);
      const simple = await tool("proposeGoal", {
        title: "Become a backend engineer",
        targetDate: shiftDay(today, 30),
        goalId: null,
      });
      await expect(
        proposals.resolveProposal(a, simple.id, "approve"),
      ).rejects.toMatchObject({ message: "duplicateGoal" });
      const next = (await tool("getNextBestAction", {
        goalId,
        limit: 1,
      })) as unknown as { actions: { taskTitle: string }[] };
      expect(next.actions[0].taskTitle).toBe("Learn Core Java");
    }, 120000);
    it("previews daily schedule conflicts, skips agreed dates, and edits one, future or all occurrences", async () => {
      const dayAfter = shiftDay(today, 2);
      await createBlock(
        "Seminar",
        zonedToUtc(`${dayAfter}T19:30`, timezone),
        zonedToUtc(`${dayAfter}T20:30`, timezone),
      );
      const request = {
        title: "Evening Java practice",
        subjectId: null,
        subjectName: "Java",
        topicId: null,
        localStartsAt: `${tomorrow}T19:00`,
        durationMinutes: 120,
        repeat: "daily",
        weekdays: [],
        until: shiftDay(tomorrow, 6),
        skipConflicts: false,
        explanation: "Daily Java",
      };
      const preview = (await tool(
        "createStudySchedule",
        request,
      )) as unknown as {
        proposalCreated: boolean;
        conflictCount: number;
      };
      expect(preview).toMatchObject({
        proposalCreated: false,
        conflictCount: 1,
      });
      const pending = await tool("createStudySchedule", {
        ...request,
        skipConflicts: true,
      });
      expect(pending.value).toMatchObject({
        skipDates: [dayAfter],
        subjectId: subject,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      });
      const saved = await proposals.resolveProposal(a, pending.id, "approve");
      const id = saved.result!.blockIds![0];
      const rows = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.title, "Evening Java practice"));
      expect(rows).toHaveLength(1);
      const [skipped] = await db
        .select()
        .from(s.scheduleExceptions)
        .where(
          and(
            eq(s.scheduleExceptions.blockId, id),
            eq(s.scheduleExceptions.date, dayAfter),
          ),
        );
      expect(skipped.isCancelled).toBe(true);
      const third = shiftDay(tomorrow, 2);
      const one = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: id,
            date: third,
            localStartsAt: `${third}T06:00`,
            scope: "one",
          },
        ],
        explanation: "Earlier once",
      });
      await proposals.resolveProposal(a, one.id, "approve");
      const all = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: id,
            date: tomorrow,
            localStartsAt: `${tomorrow}T21:00`,
            scope: "all",
          },
        ],
        explanation: "Whole series later",
      });
      expect(
        (all.value as { changes: { affected: number }[] }).changes[0].affected,
      ).toBeGreaterThan(1);
      await proposals.resolveProposal(a, all.id, "approve");
      const [series] = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.id, id));
      expect(wallTime(series.startsAt.toISOString(), timezone)).toBe(
        `${tomorrow}T21:00`,
      );
      const fifth = shiftDay(tomorrow, 4);
      const future = await tool("moveStudySessions", {
        sessions: [
          {
            blockId: id,
            date: fifth,
            localStartsAt: `${fifth}T07:00`,
            scope: "future",
          },
        ],
        explanation: "Mornings from then on",
      });
      await proposals.resolveProposal(a, future.id, "approve");
      const after = await db
        .select()
        .from(s.scheduleBlocks)
        .where(eq(s.scheduleBlocks.userId, a));
      const split = after.filter((row) =>
        row.title.startsWith("Evening Java practice"),
      );
      expect(split).toHaveLength(2);
      const history = (await tool("getStudyHistory", {
        days: 7,
      })) as unknown as {
        summary: { count: number };
      };
      expect(history.summary.count).toBeGreaterThanOrEqual(0);
    }, 120000);
    it("applies narrow preferences, preserves consent, undoes safely and rejects an intervening edit", async () => {
      const value = {
        kind: "studyPreferences",
        explanation: "One hour",
        patch: {
          dailyTargetMinutes: 60,
          preferredStudyStart: null,
          preferredStudyEnd: null,
          studyDays: null,
          coachingStyle: null,
          learningPreferences: null,
        },
      };
      const pending = await proposals.storeProposal(a, thread, value);
      await proposals.resolveProposal(a, pending.id, "approve");
      let [row] = await db
        .select()
        .from(s.aiUserPreferences)
        .where(eq(s.aiUserPreferences.userId, a));
      expect(row.value.consent).toBe(true);
      expect(row.value.dailyTargetMinutes).toBe(60);
      await proposals.resolveProposal(a, pending.id, "undo");
      [row] = await db
        .select()
        .from(s.aiUserPreferences)
        .where(eq(s.aiUserPreferences.userId, a));
      expect(row.value.dailyTargetMinutes).toBe(90);
      const next = await proposals.storeProposal(a, thread, value);
      await proposals.resolveProposal(a, next.id, "approve");
      await db
        .update(s.aiUserPreferences)
        .set({ value: { ...row.value, dailyTargetMinutes: 120 } })
        .where(eq(s.aiUserPreferences.userId, a));
      await expect(
        proposals.resolveProposal(a, next.id, "undo"),
      ).rejects.toMatchObject({ message: "conflict" });
    }, 60000);
    it("organizes owned resources without changing contents, enforces resource consent, and stores approved memory", async () => {
      const [resource] = await db
        .insert(s.resources)
        .values({
          userId: a,
          subjectId: subject,
          type: "note",
          title: "Java notes",
          textContent: "Private factual notes",
        })
        .returning();
      const pending = await tool("organizeLearningResource", {
        resourceId: resource.id,
        subjectId: subject,
        topicId: topic,
        title: "Java revision",
        explanation: "Organize",
      });
      await proposals.resolveProposal(a, pending.id, "approve");
      const [saved] = await db
        .select()
        .from(s.resources)
        .where(eq(s.resources.id, resource.id));
      expect(saved.topicId).toBe(topic);
      expect(saved.textContent).toBe("Private factual notes");
      await expect(
        tools.executeAvenTool(a, thread, "getStudyResources", {
          resourceId: resource.id,
        }),
      ).rejects.toMatchObject({ message: "resourceConsentRequired" });
      await expect(
        tools.executeAvenTool(b, thread, "organizeLearningResource", {
          resourceId: resource.id,
          subjectId: otherSubject,
          topicId: null,
          title: null,
          explanation: "Other",
        }),
      ).rejects.toMatchObject({ status: 404 });
      const memory = await tool("rememberPreference", {
        content: "I prefer practical examples.",
      });
      await proposals.resolveProposal(a, memory.id, "approve");
      const rows = await db
        .select()
        .from(s.aiMemory)
        .where(eq(s.aiMemory.userId, a));
      expect(
        rows.some((row) => row.content === "I prefer practical examples."),
      ).toBe(true);
    }, 60000);
    it("delivers a missed-session event once, groups it in chat, scopes replies and supports snooze", async () => {
      const { processAvenUser } = await import("@/lib/aven/scheduler");
      const { notificationConversation } =
        await import("@/lib/aven/proactive-conversations");
      const { notificationAction } = await import("@/lib/aven/notifications");
      await db.insert(s.notificationPreferences).values({
        userId: a,
        value: notificationPreferenceSchema.parse({
          enabled: true,
          inApp: true,
          morning: false,
          evening: false,
          randomized: false,
          goalReminders: false,
          sessionReminders: false,
          missedSessions: true,
          quietStart: "00:00",
          quietEnd: "00:00",
          dailyLimit: 10,
        }),
      });
      const now = Date.now();
      const block = await createBlock(
        "Missed fixture",
        new Date(now - 20 * 60000).toISOString(),
        new Date(now + 40 * 60000).toISOString(),
      );
      expect(await processAvenUser(a, now)).toBe(1);
      expect(await processAvenUser(a, now)).toBe(0);
      const [notification] = await db
        .select()
        .from(s.notifications)
        .where(
          and(
            eq(s.notifications.userId, a),
            sql`${s.notifications.deduplicationKey} LIKE ${"aven:missed:" + block.id + ":%"}`,
          ),
        );
      expect(notification).toBeTruthy();
      const reply = await notificationConversation(a, notification.id);
      const history = await conversations.getConversation(
        a,
        reply.conversationId,
      );
      expect(
        history.messages.some(
          (row) =>
            row.content === notification.body &&
            row.context?.blockId === block.id,
        ),
      ).toBe(true);
      await expect(
        notificationConversation(b, notification.id),
      ).rejects.toMatchObject({ status: 404 });
      const snooze = await notificationAction(a, notification.id, "snooze");
      expect(Date.parse(snooze.snoozedUntil!) - Date.now()).toBeGreaterThan(
        59 * 60000,
      );
      expect(await processAvenUser(a, now + 5 * 60000)).toBe(0);
    }, 120000);
    it("suppresses random check-ins during study, then persists one contextual event and deduplicates it", async () => {
      const { processAvenUser } = await import("@/lib/aven/scheduler");
      const day = shiftDay(today, 2),
        clock = randomCheckInTime(a, day, "12:00", "17:00"),
        now = Date.parse(zonedToUtc(`${day}T${clock}`, timezone));
      await db
        .update(s.notificationPreferences)
        .set({
          value: notificationPreferenceSchema.parse({
            enabled: true,
            randomized: true,
            morning: false,
            evening: false,
            weekly: false,
            sessionReminders: false,
            missedSessions: false,
            goalReminders: false,
            quietStart: "00:00",
            quietEnd: "00:00",
            dailyLimit: 10,
          }),
        })
        .where(eq(s.notificationPreferences.userId, a));
      await db.insert(s.activeTimers).values({
        userId: a,
        subjectId: subject,
        startedAt: new Date(now - 5 * 60000),
      });
      expect(await processAvenUser(a, now)).toBe(0);
      await db.delete(s.activeTimers).where(eq(s.activeTimers.userId, a));
      expect(await processAvenUser(a, now)).toBe(1);
      expect(await processAvenUser(a, now)).toBe(0);
      const threads = await db
        .select()
        .from(s.aiConversations)
        .where(
          and(
            eq(s.aiConversations.userId, a),
            eq(s.aiConversations.sourceKey, "companion"),
          ),
        );
      expect(threads).toHaveLength(1);
      const messages = await conversations.getConversation(a, threads[0].id);
      expect(messages.messages.length).toBeGreaterThanOrEqual(2);
    }, 120000);
    it("alerts once a week about a missed milestone and attaches a private catch-up draft", async () => {
      const { processAvenUser } = await import("@/lib/aven/scheduler");
      await db
        .update(s.notificationPreferences)
        .set({
          value: notificationPreferenceSchema.parse({
            enabled: true,
            inApp: true,
            goalReminders: true,
            morning: false,
            evening: false,
            weekly: false,
            randomized: false,
            sessionReminders: false,
            missedSessions: false,
            morningTime: "07:00",
            quietStart: "00:00",
            quietEnd: "00:00",
            dailyLimit: 10,
          }),
        })
        .where(eq(s.notificationPreferences.userId, a));
      const pending = await tool("proposeGoalHierarchy", {
        goalId: null,
        title: "Pass the cloud certification",
        description: "",
        category: "certification",
        targetDate: shiftDay(today, 40),
        successCriteria: "",
        assumptions: [],
        allowDuplicate: false,
        milestones: [
          {
            title: "Cloud fundamentals",
            description: "",
            successCriteria: "",
            estimatedHours: 5,
            dueDate: null,
            dependsOn: [],
            subjectName: null,
            tasks: [
              {
                title: "Read the exam guide",
                description: "",
                estimatedMinutes: 45,
                dueDate: null,
                dependsOnPrevious: false,
              },
            ],
          },
        ],
      });
      const goalId = (await proposals.resolveProposal(a, pending.id, "approve"))
        .result!.goalId!;
      await db
        .update(s.goalMilestones)
        .set({ dueDate: shiftDay(today, -1) })
        .where(eq(s.goalMilestones.goalId, goalId));
      const now = Date.parse(zonedToUtc(`${today}T08:40`, timezone));
      const before = await db
        .select({ id: s.notifications.id })
        .from(s.notifications)
        .where(eq(s.notifications.userId, a));
      expect(await processAvenUser(a, now)).toBe(1);
      expect(await processAvenUser(a, now)).toBe(0);
      const [alert] = await db
        .select()
        .from(s.notifications)
        .where(
          and(
            eq(s.notifications.userId, a),
            sql`${s.notifications.deduplicationKey} LIKE ${`aven:goalAlert:${goalId}:missedMilestone:%`}`,
          ),
        );
      expect(alert.body).toContain("Cloud fundamentals");
      expect(alert.body).toContain("Nothing changes unless you approve");
      const [action] = await db
        .select()
        .from(s.notificationActions)
        .where(eq(s.notificationActions.notificationId, alert.id));
      const drafts = await db
        .select()
        .from(s.aiPlanProposals)
        .where(
          and(
            eq(s.aiPlanProposals.userId, a),
            eq(s.aiPlanProposals.conversationId, action.value.conversationId!),
            eq(s.aiPlanProposals.status, "pending"),
          ),
        );
      expect(
        drafts.some(
          (row) =>
            row.value.kind === "schedule" &&
            "goalId" in row.value &&
            row.value.goalId === goalId,
        ),
      ).toBe(true);
      const after = await db
        .select({ id: s.notifications.id })
        .from(s.notifications)
        .where(eq(s.notifications.userId, a));
      expect(after.length - before.length).toBe(1);
    }, 120000);
    it("keeps anonymous spending in the shared cap after account deletion", async () => {
      const owner = crypto.randomUUID(),
        usage = crypto.randomUUID();
      await db.insert(s.users).values({
        id: owner,
        name: "Usage retention fixture",
        email: `${owner}@example.com`,
      });
      await db.insert(s.aiUsageRecords).values({
        id: usage,
        userId: owner,
        requestId: crypto.randomUUID(),
        model: "fixture-ledger",
        day: today,
        reservedTokens: 0,
        inputTokens: 10,
        outputTokens: 10,
        costMicros: 25,
        status: "complete",
      });
      try {
        await db.delete(s.users).where(eq(s.users.id, owner));
        const [retained] = await db
          .select()
          .from(s.aiUsageRecords)
          .where(eq(s.aiUsageRecords.id, usage));
        expect(retained.userId).toBeNull();
        expect(retained.costMicros).toBe(25);
      } finally {
        await db
          .delete(s.aiUsageRecords)
          .where(
            and(
              eq(s.aiUsageRecords.id, usage),
              eq(s.aiUsageRecords.model, "fixture-ledger"),
            ),
          );
        await db.delete(s.users).where(eq(s.users.id, owner));
      }
    }, 60000);
  },
);
