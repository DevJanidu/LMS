import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
} from "@/lib/aven/validation";
import { localDay, shiftDay } from "@/lib/analytics";
vi.mock("next/server", () => ({ after: () => {} }));
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
  "study attendance on disposable real database fixtures",
  () => {
    let db: ReturnType<typeof import("@/lib/db").getDb>,
      s: typeof import("@/lib/db/schema"),
      service: typeof import("@/lib/study/attendance"),
      mutate: typeof import("@/lib/services/mutations").mutate;
    const owner = crypto.randomUUID(),
      other = crypto.randomUUID(),
      subject = crypto.randomUUID(),
      thread = crypto.randomUUID();
    const timezone = "Asia/Colombo",
      now = Date.now(),
      start = new Date(now - 20 * 60000),
      end = new Date(now + 40 * 60000),
      date = localDay(now, timezone);
    const block = async (
      title: string,
      startsAt = start,
      endsAt = end,
      userId = owner,
    ) =>
      (
        await db
          .insert(s.scheduleBlocks)
          .values({
            userId,
            subjectId: userId === owner ? subject : null,
            title,
            startsAt,
            endsAt,
            timezone,
            displayColor: "orange",
          })
          .returning()
      )[0];
    const input = (row: typeof s.scheduleBlocks.$inferSelect) => ({
      blockId: row.id,
      date: localDay(row.startsAt.getTime(), timezone),
      expectedStartsAt: row.startsAt.toISOString(),
    });
    beforeAll(async () => {
      process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
      process.env.DATABASE_URL_UNPOOLED = process.env.TEST_DATABASE_URL;
      db = (await import("@/lib/db")).getDb();
      s = await import("@/lib/db/schema");
      const { neonConfig } = await import("@neondatabase/serverless");
      neonConfig.poolQueryViaFetch = false;
      service = await import("@/lib/study/attendance");
      mutate = (await import("@/lib/services/mutations")).mutate;
      await db.insert(s.users).values(
        [owner, other].map((id) => ({
          id,
          name: "Study attendance QA",
          email: `${id}@example.com`,
          timezone,
          timezoneMode: "manual" as const,
          acceptedTermsAt: new Date(),
        })),
      );
      await db.insert(s.preferences).values({ userId: owner });
      await db.insert(s.subjects).values({
        id: subject,
        userId: owner,
        title: "Maths",
        displayColor: "orange",
      });
      await db
        .insert(s.aiConversations)
        .values({ id: thread, userId: owner, title: "Attendance QA" });
      await db.insert(s.aiUserPreferences).values({
        userId: owner,
        value: aiPreferenceSchema.parse({ consent: true }),
      });
      await db.insert(s.notificationPreferences).values({
        userId: owner,
        value: notificationPreferenceSchema.parse({
          enabled: true,
          inApp: true,
          morning: false,
          goalReminders: false,
          quietStart: "00:00",
          quietEnd: "00:00",
          dailyLimit: 10,
        }),
      });
    }, 60000);
    afterAll(async () => {
      if (db && s) {
        await db
          .delete(s.auditLogs)
          .where(inArray(s.auditLogs.actorUserId, [owner, other]));
        await db.delete(s.users).where(inArray(s.users.id, [owner, other]));
      }
    }, 60000);
    it("atomically records Attend, links the timer and saves completed attendance with the real study session", async () => {
      const row = await block("Attend and finish");
      await mutate(owner, [
        {
          kind: "timer",
          value: { command: "start", subjectId: subject, schedule: input(row) },
        },
      ]);
      const [timer] = await db
        .select()
        .from(s.activeTimers)
        .where(eq(s.activeTimers.userId, owner));
      const [report] = await db
        .select()
        .from(s.scheduleAttendance)
        .where(eq(s.scheduleAttendance.id, timer.attendanceId!));
      expect(report.status).toBe("attended");
      expect(report.blockId).toBe(row.id);
      await expect(
        service.reportAttendance(owner, input(row), "skipped"),
      ).rejects.toMatchObject({ message: "attendanceInProgress" });
      await db
        .update(s.activeTimers)
        .set({ startedAt: new Date(Date.now() - 120000) })
        .where(eq(s.activeTimers.userId, owner));
      const result = await mutate(owner, [
        {
          kind: "timer",
          value: { command: "finish", note: "Worked on algebra" },
        },
      ]);
      expect(result.timerResult).toBe("saved");
      const [completed] = await db
        .select()
        .from(s.scheduleAttendance)
        .where(eq(s.scheduleAttendance.id, report.id));
      expect(completed.status).toBe("completed");
      expect(completed.sessionId).toBeTruthy();
      const [session] = await db
        .select()
        .from(s.studySessions)
        .where(eq(s.studySessions.id, completed.sessionId!));
      expect(session.subjectId).toBe(subject);
      expect(session.note).toBe("Worked on algebra");
      expect(session.durationSeconds).toBeGreaterThanOrEqual(120);
      await expect(
        service.reportAttendance(owner, input(row), "skipped"),
      ).rejects.toMatchObject({ message: "attendanceComplete" });
      const { executeAvenTool } = await import("@/lib/aven/tools");
      const calendar = (await executeAvenTool(owner, thread, "getCalendar", {
        from: date,
        to: shiftDay(date, 1),
      })) as {
        sessions: {
          blockId: string;
          attendanceStatus: string;
          attendance: { sessionId: string };
        }[];
      };
      const actual = calendar.sessions.find((item) => item.blockId === row.id)!;
      expect(actual.attendanceStatus).toBe("completed");
      expect(actual.attendance.sessionId).toBe(session.id);
    }, 120000);
    it("rejects cross-account attendance, stale starts and early attendance without writing a record", async () => {
      const row = await block("Ownership"),
        privateRow = await block("Private", start, end, other);
      await expect(
        service.reportAttendance(owner, input(privateRow), "attended"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.reportAttendance(
          owner,
          {
            ...input(row),
            expectedStartsAt: new Date(now + 60000).toISOString(),
          },
          "attended",
        ),
      ).rejects.toMatchObject({ message: "attendanceChanged" });
      const future = await block(
        "Future",
        new Date(now + 7200000),
        new Date(now + 10800000),
      );
      await expect(
        service.reportAttendance(owner, input(future), "attended"),
      ).rejects.toMatchObject({ message: "attendanceWindow" });
      for (const item of [row, privateRow, future])
        expect(
          (await service.attendanceList(owner)).some(
            (record) => record.blockId === item.id,
          ),
        ).toBe(false);
    }, 120000);
    it("preserves skipped sessions, makes Attend idempotent, and suppresses reminders only for attended snapshots", async () => {
      const attended = await block("Already attended"),
        skipped = await block("Skipped Maths");
      const first = await service.reportAttendance(
          owner,
          input(attended),
          "attended",
        ),
        replay = await service.reportAttendance(
          owner,
          input(attended),
          "attended",
        );
      expect(replay.attendance.id).toBe(first.attendance.id);
      await service.reportAttendance(owner, input(skipped), "skipped");
      expect(
        await db
          .select()
          .from(s.scheduleBlocks)
          .where(eq(s.scheduleBlocks.id, skipped.id)),
      ).toHaveLength(1);
      const { processAvenUser } = await import("@/lib/aven/scheduler");
      await processAvenUser(owner, now);
      let notifications = await db
        .select()
        .from(s.notifications)
        .where(eq(s.notifications.userId, owner));
      expect(
        notifications.some((row) => row.body.includes("Already attended")),
      ).toBe(false);
      // Other unmarked QA blocks may get the first missed-session slot; repeat the worker to check deduplication and all candidates.
      for (let index = 0; index < 4; index++) await processAvenUser(owner, now);
      notifications = await db
        .select()
        .from(s.notifications)
        .where(eq(s.notifications.userId, owner));
      expect(
        notifications.filter((row) => row.body.includes("Skipped Maths")),
      ).toHaveLength(1);
      expect(
        notifications.find((row) => row.body.includes("Skipped Maths"))?.body,
      ).toContain("You skipped");
      await db
        .update(s.scheduleBlocks)
        .set({ startsAt: new Date(now - 15 * 60000), endsAt: end })
        .where(eq(s.scheduleBlocks.id, attended.id));
      await processAvenUser(owner, now);
      notifications = await db
        .select()
        .from(s.notifications)
        .where(eq(s.notifications.userId, owner));
      expect(
        notifications.some((row) => row.body.includes("Already attended")),
      ).toBe(true);
    }, 120000);
    it("records skipping from an Aven notification without deleting the planner occurrence", async () => {
      const row = await block("Skip from notification");
      const [notification] = await db
        .insert(s.notifications)
        .values({
          userId: owner,
          type: "aven",
          title: "Study reminder",
          body: "Attend this session",
          deduplicationKey: crypto.randomUUID(),
          scheduledFor: new Date(),
        })
        .returning();
      await db.insert(s.notificationActions).values({
        notificationId: notification.id,
        value: {
          kind: "session",
          blockId: row.id,
          date: input(row).date,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt.toISOString(),
        },
      });
      const { notificationAction } = await import("@/lib/aven/notifications");
      await notificationAction(owner, notification.id, "skip");
      await notificationAction(owner, notification.id, "skip");
      expect(
        (await service.attendanceList(owner)).find(
          (record) => record.blockId === row.id,
        )?.status,
      ).toBe("skipped");
      expect(
        await db
          .select()
          .from(s.scheduleBlocks)
          .where(eq(s.scheduleBlocks.id, row.id)),
      ).toHaveLength(1);
    }, 120000);
    it("records a weekly occurrence moved a week away using its original date", async () => {
      const sourceDate = shiftDay(date, -7);
      const [row] = await db
        .insert(s.scheduleBlocks)
        .values({
          userId: owner,
          subjectId: subject,
          title: "Moved weekly study",
          startsAt: new Date(start.getTime() - 7 * 86400000),
          endsAt: new Date(end.getTime() - 7 * 86400000),
          timezone,
          displayColor: "orange",
          recurrenceRule: { weekdays: [0, 1, 2, 3, 4, 5, 6] },
        })
        .returning();
      await db.insert(s.scheduleExceptions).values({
        blockId: row.id,
        date: sourceDate,
        newStartsAt: start,
        newEndsAt: end,
      });
      const result = await service.reportAttendance(
        owner,
        {
          blockId: row.id,
          date: sourceDate,
          expectedStartsAt: start.toISOString(),
        },
        "attended",
      );
      expect(result.attendance.date).toBe(sourceDate);
      expect(result.attendance.startsAt).toBe(start.toISOString());
    }, 60000);
    it("links a title-only attended block to the subject the learner chooses", async () => {
      const [row] = await db
        .insert(s.scheduleBlocks)
        .values({
          userId: owner,
          title: "Independent practice",
          startsAt: start,
          endsAt: end,
          timezone,
          displayColor: "brand",
        })
        .returning();
      const reported = await service.reportAttendance(
        owner,
        input(row),
        "attended",
      );
      await mutate(owner, [
        {
          kind: "timer",
          value: { command: "start", subjectId: subject, schedule: input(row) },
        },
      ]);
      const [timer] = await db
        .select()
        .from(s.activeTimers)
        .where(eq(s.activeTimers.userId, owner));
      expect(timer.attendanceId).toBe(reported.attendance.id);
      await mutate(owner, [{ kind: "timer", value: { command: "discard" } }]);
      const [unchanged] = await db
        .select()
        .from(s.scheduleAttendance)
        .where(eq(s.scheduleAttendance.id, reported.attendance.id));
      expect(unchanged.status).toBe("attended");
      expect(unchanged.sessionId).toBeNull();
    }, 60000);
  },
);
