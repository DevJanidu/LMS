import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import {
  chooseCheckIn,
  morningBriefing,
  weeklyReview,
  type MessagePart,
} from "@/lib/aven/companion-model";
import { goalAlerts, weekKey } from "@/lib/aven/goal-monitor";
import {
  candidateEnabled,
  mayNotify,
  shiftClock,
} from "@/lib/aven/scheduler-model";
import { classifyIntent } from "@/lib/aven/intent";
import { notificationPreferenceSchema } from "@/lib/aven/validation";
import type { GoalDetail } from "@/lib/goals/model";
const t = createTranslator({
  locale: "en",
  messages: en,
  namespace: "aven.notifications",
});
const render = (parts: MessagePart[]) =>
  parts
    .map((part) => t(part.key as "missedTitle", part.values as never))
    .join(" ");
const now = Date.parse("2026-10-12T12:00:00Z");
const upcoming = {
  title: "Java",
  startsAt: "2026-10-12T13:00:00Z",
  localTime: "18:30",
};
const action = {
  taskTitle: "Collections exercise",
  goalTitle: "Java backend job",
  remainingMinutes: 40,
};
describe("contextual check-ins", () => {
  it("suggests a fitting task before the next planned session without claiming free time", () => {
    const choice = chooseCheckIn({
      now,
      recordedMinutesToday: 0,
      upcoming,
      nextAction: action,
    });
    expect(choice?.template).toBe("freeTime");
    const text = render([choice!.part]);
    expect(text).toContain("starts in 60 minutes");
    expect(text).toContain("If you have time before then");
    expect(text).toContain("Collections exercise");
  });
  it("skips the free-time suggestion when the task does not fit", () => {
    const choice = chooseCheckIn({
      now,
      recordedMinutesToday: 0,
      upcoming,
      nextAction: { ...action, remainingMinutes: 120 },
    });
    expect(choice?.template).toBe("upcoming");
  });
  it("varies the message and never sends one without verified context", () => {
    const context = {
      now,
      recordedMinutesToday: 25,
      deadline: { title: "Spring Boot exam", days: 3 },
    };
    expect(chooseCheckIn(context)?.template).toBe("deadlineSoon");
    expect(
      chooseCheckIn({ ...context, lastTemplate: "deadlineSoon" })?.template,
    ).toBe("progress");
    expect(render([chooseCheckIn(context)!.part])).toContain(
      "is due in 3 days",
    );
    expect(chooseCheckIn({ now, recordedMinutesToday: 0 })).toBeNull();
  });
});
describe("briefings and reviews", () => {
  it("summarizes today's verified plan with a recommended focus", () => {
    const text = render(
      morningBriefing({
        sessions: [upcoming, { ...upcoming, title: "Math" }],
        tasksDueToday: 0,
        tasksDueThisWeek: 2,
        nextAction: action,
      }),
    );
    expect(text).toBe(
      'Your first session today is Java at 18:30, with 1 more planned. 2 tasks are due this week. Want to focus on "Collections exercise" today?',
    );
    expect(
      render(
        morningBriefing({
          sessions: [],
          tasksDueToday: 1,
          tasksDueThisWeek: 1,
        }),
      ),
    ).toContain("No study sessions are planned today. 1 task is due today.");
  });
  it("compares weeks only when last week has records", () => {
    const base = {
      thisWeek: { minutes: 240, sessions: 4 },
      completedTasks: 3,
      missedSessions: 1,
      activeGoals: 2,
      deadlinesNextWeek: 0,
      nextAction: action,
    };
    const compared = render(
      weeklyReview({ ...base, lastWeek: { minutes: 180, sessions: 3 } }),
    );
    expect(compared).toContain("4 hours across 4 study sessions");
    expect(compared).toContain("That's 1 more session than last week.");
    expect(compared).toContain("1 planned session has no attendance recorded.");
    const first = render(
      weeklyReview({ ...base, lastWeek: { minutes: 0, sessions: 0 } }),
    );
    expect(first).not.toContain("last week");
  });
});
const goal = (
  overrides: Partial<{
    status: string;
    targetDate: string;
    startDate: string;
    health: string;
    blocked: boolean;
    milestoneDue: string;
    studiedRecently: boolean;
  }> = {},
) =>
  ({
    goal: {
      id: "g1",
      title: "Spring Boot",
      status: overrides.status ?? "active",
      targetDate: overrides.targetDate ?? "2026-12-31",
      startDate: overrides.startDate ?? "2026-10-11",
    },
    tasks: [
      {
        id: "t1",
        title: "Security",
        status: "todo",
        completedAt: null,
        milestoneId: "m1",
      },
    ],
    milestones: [
      { id: "m1", title: "Basics", dueDate: overrides.milestoneDue ?? null },
    ],
    sessions: overrides.studiedRecently
      ? [{ startedAt: "2026-10-11T10:00:00Z" }]
      : [],
    activity: [],
    progress: {
      health: overrides.health ?? "onTrack",
      taskProgress: { t1: 0 },
      milestoneProgress: { m1: 0 },
      blockedIds: overrides.blocked ? ["t1"] : [],
    },
  }) as unknown as GoalDetail;
describe("goal monitoring", () => {
  const context = { today: "2026-10-12", now };
  it("detects approaching deadlines and missed milestones from records", () => {
    expect(
      goalAlerts([goal({ targetDate: "2026-10-17" })], context)[0],
    ).toMatchObject({
      kind: "deadline",
      daysLeft: 5,
      remainingTasks: 1,
      recoverable: true,
    });
    expect(
      goalAlerts([goal({ milestoneDue: "2026-10-10" })], context)[0],
    ).toMatchObject({ kind: "missedMilestone", milestoneTitle: "Basics" });
  });
  it("detects blocked work and inactivity, and ignores inactive goals", () => {
    expect(goalAlerts([goal({ blocked: true })], context)[0]).toMatchObject({
      kind: "blocked",
      recoverable: false,
    });
    expect(
      goalAlerts([goal({ startDate: "2026-09-01" })], context)[0].kind,
    ).toBe("inactive");
    expect(
      goalAlerts(
        [goal({ startDate: "2026-09-01", studiedRecently: true })],
        context,
      ),
    ).toEqual([]);
    expect(
      goalAlerts(
        [goal({ status: "paused", targetDate: "2026-10-13" })],
        context,
      ),
    ).toEqual([]);
  });
  it("buckets repeat alerts by week and renders every alert", () => {
    expect(weekKey("2026-10-12")).toBe("2026-10-12");
    expect(weekKey("2026-10-18")).toBe("2026-10-12");
    for (const kind of [
      "deadline",
      "missedMilestone",
      "attention",
      "blocked",
      "inactive",
    ])
      expect(
        render([
          {
            key: `goalAlert.${kind}`,
            values: { title: "X", days: 5, tasks: 2, milestone: "M" },
          },
          { key: `goalAlert.${kind}Title` },
        ]),
      ).not.toContain("goalAlert");
  });
});
describe("scheduling rules", () => {
  it("wraps clocks, gates goal alerts on goal reminders and respects caps", () => {
    expect(shiftClock("07:00", 90)).toBe("08:30");
    expect(shiftClock("23:30", 90)).toBe("01:00");
    const prefs = notificationPreferenceSchema.parse({
      enabled: true,
      goalReminders: false,
      quietStart: "22:00",
      quietEnd: "07:00",
      dailyLimit: 2,
    });
    expect(candidateEnabled("goalAlert", prefs)).toBe(false);
    expect(mayNotify(prefs, now, "UTC", 2)).toBe(false);
    expect(mayNotify(prefs, now, "UTC", 1)).toBe(true);
    expect(mayNotify(prefs, Date.parse("2026-10-12T23:00:00Z"), "UTC", 0)).toBe(
      false,
    );
    expect(mayNotify(prefs, now, "Asia/Colombo", 0)).toBe(true);
    expect(
      mayNotify(prefs, Date.parse("2026-10-12T17:00:00Z"), "Asia/Colombo", 0),
    ).toBe(false);
  });
  it("recognizes falling-behind requests", () => {
    const intent = classifyIntent(
      "I fell behind on Spring Boot, can you help me catch up?",
    );
    expect(intent.intents).toContain("recovery");
    expect(intent.planning).toBe(true);
  });
});
