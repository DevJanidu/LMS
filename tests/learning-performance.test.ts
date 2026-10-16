import { expect, it } from "vitest";
import { goalSchema, milestoneSchema, taskSchema } from "@/lib/goals/validation";
import { calculateGoalProgress, type GoalDetail } from "@/lib/goals/model";
import { auditTopicCoverage } from "@/lib/learning/coverage";
import { evaluateGoalHealth } from "@/lib/learning/goal-health";
import { detectLearningGaps } from "@/lib/learning/gaps";
import { planPracticeSessions } from "@/lib/learning/practice";
import { aiPreferenceSchema } from "@/lib/aven/validation";
/**
 * Synthetic load for monitoring layer A (no database, no model calls): the CPU cost
 * per learner that the scheduler adds. Database cost is not measured here.
 */
const TODAY = "2026-10-16",
  NOW = Date.parse(`${TODAY}T08:00:00Z`);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const prefs = aiPreferenceSchema.parse({ studyDays: [0, 1, 2, 3, 4, 5, 6], preferredStudyEnd: "22:00" });
function syntheticUser(seed: number) {
  const details: GoalDetail[] = Array.from({ length: 5 }, (_, g) => {
    const goal = {
      ...goalSchema.parse({ title: `Goal ${g}`, startDate: "2026-09-01", targetDate: "2026-12-31" }),
      id: id(seed * 1000 + g), userId: id(seed), version: 1,
      createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
    };
    const milestones = Array.from({ length: 4 }, (_, m) => ({
      ...milestoneSchema.parse({ title: `M${m}`, dueDate: `2026-${String(9 + m).padStart(2, "0")}-15` }),
      id: id(seed * 1000 + 100 + g * 10 + m), goalId: goal.id,
      dependencyIds: m ? [id(seed * 1000 + 100 + g * 10 + m - 1)] : [],
    }));
    const tasks = Array.from({ length: 20 }, (_, t) => ({
      ...taskSchema.parse({ title: `T${t}`, dueDate: `2026-${String(9 + (t % 4)).padStart(2, "0")}-1${t % 9}` }),
      id: id(seed * 1000 + 300 + g * 40 + t), goalId: goal.id,
      milestoneId: milestones[t % 4].id, subjectId: id(50 + (t % 3)), topicId: null,
      status: t % 3 === 0 ? "completed" : "todo", actualSeconds: 0,
      completedAt: t % 3 === 0 ? "2026-10-01T00:00:00Z" : null, updatedAt: goal.updatedAt,
      dependencyIds: t > 0 && t % 5 ? [id(seed * 1000 + 300 + g * 40 + t - 1)] : [],
    })) as GoalDetail["tasks"];
    return {
      goal, tasks, milestones, activity: [], sessions: [], history: [], snapshots: [],
      progress: calculateGoalProgress(goal, tasks, milestones, [], [], TODAY),
    };
  });
  const topics = Array.from({ length: 35 }, (_, t) => ({
    id: id(seed * 1000 + 600 + t), title: `Topic ${t}`,
    status: (t < 24 ? "completed" : "not_started") as "completed" | "not_started",
    targetDate: t % 5 ? null : "2026-10-10", completedAt: null, sortOrder: t,
  }));
  return { details, topics };
}
it("evaluates synthetic learners within a bounded CPU budget", () => {
  const users = 2000;
  const fixtures = Array.from({ length: users }, (_, n) => syntheticUser(n + 1));
  const started = performance.now();
  let findings = 0;
  for (const user of fixtures) {
    const healths = user.details.map((detail) =>
      evaluateGoalHealth(detail, { today: TODAY, now: NOW, dailyTargetMinutes: 90, studyDays: prefs.studyDays }),
    );
    findings += detectLearningGaps({
      today: TODAY, healths, details: user.details, subjects: [], postponedTopics: [], missed: [],
      studyMinutesBySubject: { [id(52)]: 120 }, attention: [],
    }).length;
    const audit = auditTopicCoverage({
      subject: { id: id(50), title: "Advanced Java", targetDate: null }, topics: user.topics,
      occurrences: [], postponements: [], studies: [], goalTasks: [], goalScheduledTopicIds: [],
      confidence: {}, today: TODAY, now: NOW,
    });
    planPracticeSessions({
      audit, attention: { level: "needsPractice", reportedAt: null, improved: false, topics: {} },
      preferences: prefs, commitments: [], timezone: "UTC", now: NOW,
      request: { sessions: 3, minutes: 45, horizonDays: 7 },
    });
  }
  const elapsed = performance.now() - started;
  const perUser = elapsed / users;
  console.info(
    JSON.stringify({ event: "learning_engine_benchmark", users, goalsPerUser: 5, tasksPerGoal: 20, topics: 35, findings, totalMs: Math.round(elapsed), msPerUser: Number(perUser.toFixed(3)) }),
  );
  expect(findings).toBeGreaterThan(0);
  // Generous bound so slow CI machines pass; the measured figure is logged above.
  expect(perUser).toBeLessThan(25);
});
