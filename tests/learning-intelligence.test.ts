import { describe, expect, it } from "vitest";
import {
  goalSchema,
  milestoneSchema,
  taskSchema,
} from "@/lib/goals/validation";
import {
  calculateGoalProgress,
  type GoalDetail,
  type GoalMilestone,
  type GoalRecord,
  type GoalTask,
} from "@/lib/goals/model";
import { auditTopicCoverage, type CoverageTopic } from "@/lib/learning/coverage";
import { evaluateGoalHealth } from "@/lib/learning/goal-health";
import { detectLearningGaps } from "@/lib/learning/gaps";
import {
  choosePracticeTopics,
  planPracticeSessions,
  type PracticeCommitment,
} from "@/lib/learning/practice";
import {
  appendSignal,
  MAX_SIGNALS,
  removeSignals,
  subjectAttention,
  type LearningSignal,
} from "@/lib/learning/signals";
import { validateSchedule, overlaps } from "@/lib/aven/planning";
import { rankNextActions } from "@/lib/goals/next-action";
import { classifyIntent } from "@/lib/aven/intent";
import { candidateEnabled } from "@/lib/aven/scheduler-model";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
  proposalSchema,
} from "@/lib/aven/validation";

const uuid = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const TODAY = "2026-10-16"; // Friday
const NOW = Date.parse(`${TODAY}T08:00:00Z`);
const TZ = "UTC";
const prefs = aiPreferenceSchema.parse({
  preferredStudyStart: "17:00",
  preferredStudyEnd: "21:00",
  dailyTargetMinutes: 120,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
});
const JAVA = uuid(500),
  SQL = uuid(501),
  SPRING = uuid(502);

function topicList(total: number, completed: number): CoverageTopic[] {
  return Array.from({ length: total }, (_, index) => ({
    id: uuid(1000 + index),
    title: `Topic ${index + 1}`,
    status: index < completed ? "completed" : "not_started",
    targetDate: null,
    completedAt: index < completed ? "2026-10-01T10:00:00Z" : null,
    sortOrder: index,
  }));
}
function audit(
  topics: CoverageTopic[],
  extra: Partial<Parameters<typeof auditTopicCoverage>[0]> = {},
) {
  return auditTopicCoverage({
    subject: { id: JAVA, title: "Advanced Java", targetDate: null },
    topics,
    occurrences: [],
    postponements: [],
    studies: [],
    goalTasks: [],
    goalScheduledTopicIds: [],
    confidence: {},
    today: TODAY,
    now: NOW,
    ...extra,
  });
}
function goalDetail(input: {
  goal?: Partial<GoalRecord>;
  milestones?: GoalMilestone[];
  tasks: GoalTask[];
  sessions?: GoalDetail["sessions"];
}): GoalDetail {
  const goal: GoalRecord = {
    ...goalSchema.parse({
      title: "Become a Java Backend Developer",
      startDate: "2026-09-01",
      targetDate: "2026-12-31",
    }),
    id: uuid(1),
    userId: uuid(2),
    version: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...input.goal,
  };
  const milestones = input.milestones ?? [];
  const sessions = input.sessions ?? [];
  return {
    goal,
    tasks: input.tasks,
    milestones,
    activity: [],
    sessions,
    history: [],
    snapshots: [],
    progress: calculateGoalProgress(goal, input.tasks, milestones, [], sessions, TODAY),
  };
}
const task = (id: number, fields: Partial<GoalTask> = {}): GoalTask => ({
  ...taskSchema.parse({ title: `Task ${id}` }),
  id: uuid(id),
  goalId: uuid(1),
  actualSeconds: 0,
  completedAt: null,
  updatedAt: "2026-09-01T00:00:00Z",
  ...fields,
});
const milestone = (
  id: number,
  fields: Partial<GoalMilestone> = {},
): GoalMilestone => ({
  ...milestoneSchema.parse({ title: `Milestone ${id}` }),
  id: uuid(id),
  goalId: uuid(1),
  ...fields,
});
const health = (detail: GoalDetail) =>
  evaluateGoalHealth(detail, {
    today: TODAY,
    now: NOW,
    dailyTargetMinutes: prefs.dailyTargetMinutes,
    studyDays: prefs.studyDays,
  });
const at = (day: string, clock: string) => `${day}T${clock}:00.000Z`;

describe("Test 2: topic coverage from records", () => {
  it("counts 35 required, 24 completed, 11 remaining and classifies the gaps", () => {
    const topics = topicList(35, 24);
    topics[24].targetDate = "2026-10-10"; // overdue
    topics[25].targetDate = "2026-10-12"; // overdue
    topics[26].status = "in_progress";
    const result = audit(topics, {
      occurrences: [
        // Planned in the past without completion.
        { topicId: topics[27].id, date: "2026-10-14", startsAt: at("2026-10-14", "17:00"), endsAt: at("2026-10-14", "18:00") },
        // Upcoming coverage.
        { topicId: topics[28].id, date: "2026-10-18", startsAt: at("2026-10-18", "17:00"), endsAt: at("2026-10-18", "18:00") },
      ],
      postponements: [
        { topicId: topics[29].id, date: "2026-10-05", kind: "moved" },
        { topicId: topics[29].id, date: "2026-10-12", kind: "skipped" },
      ],
      goalScheduledTopicIds: [topics[30].id],
      studies: [{ topicId: topics[26].id, startedAt: "2026-10-15T17:00:00Z", seconds: 2700 }],
    });
    expect(result.counts).toMatchObject({
      required: 35,
      completed: 24,
      remaining: 11,
      overdue: 2,
      plannedNotCompleted: 1,
      repeatedlyPostponed: 1,
    });
    // 11 open − planned (27, 28) − goal-scheduled (30) = 8 never scheduled.
    expect(result.counts.neverScheduled).toBe(8);
    expect(result.neverScheduled.map((t) => t.id)).not.toContain(topics[28].id);
    expect(result.repeatedlyPostponed).toEqual([
      { id: topics[29].id, title: "Topic 30", postponements: 2 },
    ]);
    expect(result.upcomingCoverage).toHaveLength(1);
    expect(result.topics[26]).toMatchObject({ studied: true, studiedMinutes: 45, completed: false });
  });
  it("never reports mastery: completion and self-reports are separate facts", () => {
    const result = audit(topicList(3, 3), {
      confidence: { [uuid(1000)]: "confident" },
    });
    expect(result.mastery.measured).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/"mastered"/);
    expect(result.topics[0]).toMatchObject({ completed: true, selfReportedConfidence: "confident" });
    expect(result.topics[1].selfReportedConfidence).toBeNull();
  });
  it("reports prerequisite gaps from goal dependencies", () => {
    const topics = topicList(2, 0);
    const result = audit(topics, {
      goalTasks: [
        {
          topicId: topics[1].id,
          taskTitle: "Concurrency drills",
          goalId: uuid(1),
          goalTitle: "Backend",
          blockedBy: ["Collections practice"],
        },
      ],
    });
    expect(result.prerequisiteGaps).toEqual([
      expect.objectContaining({ topicTitle: "Topic 2", blockedBy: ["Collections practice"] }),
    ]);
  });
});

describe("Test 1: struggling with a subject gets conflict-free practice", () => {
  const topics = topicList(6, 2);
  const concurrency = topics[4];
  concurrency.title = "Concurrency";
  const commitments: PracticeCommitment[] = [
    // Existing evening sessions that must be preserved.
    { blockId: uuid(700), date: "2026-10-16", title: "Spring Boot", subjectId: SPRING, startsAt: at("2026-10-16", "17:00"), endsAt: at("2026-10-16", "18:00") },
    { blockId: uuid(701), date: "2026-10-17", title: "SQL", subjectId: SQL, startsAt: at("2026-10-17", "17:00"), endsAt: at("2026-10-17", "19:30") },
  ];
  const signals: LearningSignal[] = [
    { subjectId: JAVA, topicId: concurrency.id, level: "needsPractice", source: "chat", at: "2026-10-15T12:00:00Z" },
  ];
  const coverage = audit(topics, {
    confidence: subjectAttention(signals, JAVA, { now: NOW }).topics,
  });
  const plan = planPracticeSessions({
    audit: coverage,
    attention: subjectAttention(signals, JAVA, { now: NOW }),
    preferences: prefs,
    commitments,
    timezone: TZ,
    now: NOW,
    request: { sessions: 3, minutes: 45, horizonDays: 7 },
  });
  it("targets the reported topic first and explains each choice", () => {
    expect(plan.sessions).toHaveLength(3);
    expect(plan.sessions[0]).toMatchObject({ topicId: concurrency.id, reason: "reportedDifficulty" });
    expect(plan.sessions.every((s) => s.reason)).toBe(true);
  });
  it("never overlaps commitments, stays in study hours and spreads across days", () => {
    for (const session of plan.sessions) {
      expect(commitments.some((c) => overlaps(session, c))).toBe(false);
      const clock = session.startsAt.slice(11, 16);
      expect(clock >= "17:00" && session.endsAt.slice(11, 16) <= "21:00").toBe(true);
    }
    expect(new Set(plan.sessions.map((s) => s.startsAt.slice(0, 10))).size).toBe(3);
    // The approval-time validator (overlap, daily target, same day, future) accepts it.
    expect(() =>
      validateSchedule(plan.sessions, commitments, NOW, prefs.dailyTargetMinutes, TZ),
    ).not.toThrow();
  });
  it("produces a valid schedule proposal tied to a recommendation key", () => {
    const value = proposalSchema.parse({
      kind: "schedule",
      goalId: null,
      expectedVersion: 0,
      recommendationKey: `practice:${JAVA}`,
      explanation: "Extra practice",
      sessions: plan.sessions.map((s) => ({
        title: `Practice: ${s.topicTitle}`,
        taskId: null,
        subjectId: JAVA,
        topicId: s.topicId,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
    });
    expect(value.kind === "schedule" && value.recommendationKey).toBe(`practice:${JAVA}`);
  });
  it("skips topics whose goal tasks wait on prerequisites and says so", () => {
    const blocked = audit(topicList(2, 1), {
      goalTasks: [{ topicId: uuid(1001), taskTitle: "T", goalId: uuid(1), goalTitle: "G", blockedBy: ["P"] }],
    });
    const result = choosePracticeTopics(blocked, { level: "needsPractice", reportedAt: null, improved: false, topics: {} });
    expect(result.chosen.map((c) => c.id)).not.toContain(uuid(1001));
    expect(result.skippedBlocked).toEqual([{ id: uuid(1001), title: "Topic 2", blockedBy: ["P"] }]);
  });
});

describe("Test 3: overdue goal milestone", () => {
  const sqlMilestone = milestone(10, { title: "Complete SQL Foundations", dueDate: "2026-10-09" });
  const detail = goalDetail({
    milestones: [sqlMilestone],
    tasks: [
      task(20, { title: "Joins practice", milestoneId: sqlMilestone.id, subjectId: SQL, estimatedMinutes: 60 }),
      task(21, { title: "Indexes", milestoneId: sqlMilestone.id, subjectId: SQL, estimatedMinutes: 60 }),
      task(22, { title: "Basics", milestoneId: sqlMilestone.id, status: "completed", completedAt: "2026-10-05T10:00:00Z" }),
    ],
  });
  it("detects the overdue milestone with its unfinished tasks and explains why", () => {
    const result = health(detail);
    expect(result.status).toBe("needsAttention");
    expect(result.reasons).toContainEqual({
      code: "overdueMilestone",
      milestoneId: sqlMilestone.id,
      milestone: "Complete SQL Foundations",
      dueDate: "2026-10-09",
      openTasks: 2,
    });
    expect(result.metrics).toMatchObject({ overdueMilestones: 1, pendingTasks: 2, totalMilestones: 1 });
    const findings = detectLearningGaps({
      today: TODAY, healths: [result], details: [detail], subjects: [], postponedTopics: [], missed: [], studyMinutesBySubject: {}, attention: [],
    });
    expect(findings[0]).toMatchObject({ code: "overdueMilestone", severity: "high", openTasks: 2 });
  });
  it("is at risk when an overdue prerequisite blocks work due within a week", () => {
    const next = milestone(11, { title: "Database integration", dueDate: "2026-10-20", dependencyIds: [sqlMilestone.id] });
    const blocked = goalDetail({
      milestones: [sqlMilestone, next],
      tasks: [
        task(20, { title: "Joins practice", milestoneId: sqlMilestone.id, subjectId: SQL }),
        task(30, { title: "Spring Data JPA", milestoneId: next.id, subjectId: SPRING }),
      ],
    });
    const result = health(blocked);
    expect(result.status).toBe("atRisk");
    expect(result.reasons[0]).toMatchObject({
      code: "overdueBlocksUpcoming",
      task: "Joins practice",
      blocks: ["Spring Data JPA"],
      nextDueDate: "2026-10-20",
    });
  });
  it("is at risk when remaining work exceeds the time left, with both figures", () => {
    const tight = goalDetail({
      goal: { targetDate: "2026-10-17" },
      tasks: [task(40, { estimatedMinutes: 600 })],
    });
    const result = health(tight);
    expect(result.status).toBe("atRisk");
    expect(result.reasons).toContainEqual({ code: "capacityShortfall", remainingMinutes: 600, availableMinutes: 240 });
    // No study ever recorded since the goal started on 2026-09-01.
    expect(result.reasons).toContainEqual({ code: "noRecentProgress", days: 45 });
  });
  it("is on track with nothing overdue and enough time", () => {
    const fine = goalDetail({
      tasks: [task(41, { dueDate: "2026-11-30", estimatedMinutes: 60, completedAt: null })],
      sessions: [{ id: uuid(90), sessionId: uuid(90), taskId: null, allocatedSeconds: 600, startedAt: "2026-10-15T17:00:00Z", subjectId: JAVA, title: "x" }],
    });
    expect(health(fine)).toMatchObject({ status: "onTrack", reasons: [] });
  });
});

describe("Test 4: wrong priority", () => {
  const sqlMilestone = milestone(10, { title: "Complete SQL Foundations", dueDate: "2026-10-09" });
  const springMilestone = milestone(11, { title: "Spring Boot APIs", dueDate: "2026-11-30", dependencyIds: [sqlMilestone.id] });
  const prerequisite = task(20, { title: "Joins practice", milestoneId: sqlMilestone.id, subjectId: SQL });
  const dependent = task(30, { title: "Repository layer", milestoneId: springMilestone.id, subjectId: SPRING, dependencyIds: [prerequisite.id] });
  const detail = goalDetail({ milestones: [sqlMilestone, springMilestone], tasks: [prerequisite, dependent] });
  const findings = detectLearningGaps({
    today: TODAY,
    healths: [health(detail)],
    details: [detail],
    subjects: [{ id: SQL, title: "SQL" }, { id: SPRING, title: "Spring Boot" }],
    postponedTopics: [],
    missed: [],
    studyMinutesBySubject: { [SPRING]: 180 },
    attention: [],
  });
  it("identifies time spent elsewhere while a prerequisite waits", () => {
    expect(findings.find((f) => f.code === "priorityMismatch")).toMatchObject({
      severity: "high",
      task: "Joins practice",
      prerequisite: true,
      busySubject: "Spring Boot",
      busyMinutes: 180,
    });
  });
  it("does not flag a mismatch without verified time elsewhere", () => {
    const quiet = detectLearningGaps({
      today: TODAY, healths: [health(detail)], details: [detail], subjects: [], postponedTopics: [], missed: [],
      studyMinutesBySubject: { [SPRING]: 20 }, attention: [],
    });
    expect(quiet.some((f) => f.code === "priorityMismatch")).toBe(false);
  });
  it("ranks the neglected prerequisite first with explainable reasons", () => {
    const [first] = rankNextActions([detail], { today: TODAY, now: NOW, dailyTargetMinutes: 90 });
    expect(first.taskTitle).toBe("Joins practice");
    expect(first.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["overdue", "unblocks"]));
  });
  it("adds reported difficulty and postponements as evidence in the ranking", () => {
    const javaDetail = goalDetail({
      tasks: [
        task(50, { title: "Generics", subjectId: SPRING, topicId: uuid(60) }),
        task(51, { title: "Concurrency", subjectId: JAVA, topicId: uuid(61) }),
      ],
    });
    const [first] = rankNextActions([javaDetail], {
      today: TODAY,
      now: NOW,
      dailyTargetMinutes: 90,
      difficulty: { [JAVA]: "needsPractice" },
      postponedTopics: { [uuid(61)]: 2 },
    });
    expect(first.taskTitle).toBe("Concurrency");
    expect(first.reasons).toEqual(
      expect.arrayContaining([{ code: "reportedDifficulty" }, { code: "postponed", count: 2 }]),
    );
  });
});

describe("Test 5: proactive detection deduplicates and respects preferences", () => {
  const input = {
    today: TODAY,
    healths: [],
    details: [],
    subjects: [{ id: JAVA, title: "Advanced Java" }],
    postponedTopics: [{ topicId: uuid(61), topic: "Concurrency", subjectId: JAVA, count: 2 }],
    missed: [{ subjectId: JAVA, date: "2026-10-13" }, { subjectId: JAVA, date: "2026-10-14" }],
    studyMinutesBySubject: {},
    attention: [],
  };
  it("produces stable fingerprints until the facts change", () => {
    const first = detectLearningGaps(input).map((f) => f.fingerprint);
    expect(detectLearningGaps(input).map((f) => f.fingerprint)).toEqual(first);
    const changed = detectLearningGaps({
      ...input,
      postponedTopics: [{ ...input.postponedTopics[0], count: 3 }],
    }).map((f) => f.fingerprint);
    expect(changed).not.toEqual(first);
    expect(detectLearningGaps(input).map((f) => f.code)).toEqual(["postponedTopic", "missedSessions"]);
  });
  it("is controlled by the goal reminder preference", () => {
    expect(candidateEnabled("learningAlert", notificationPreferenceSchema.parse({ goalReminders: true }))).toBe(true);
    expect(candidateEnabled("learningAlert", notificationPreferenceSchema.parse({ goalReminders: false }))).toBe(false);
  });
  it("does not treat every lapse as urgent", () => {
    const inactive = goalDetail({
      goal: { startDate: "2026-09-01", targetDate: "2027-03-01" },
      tasks: [task(70, { dueDate: "2027-01-01" })],
    });
    const [finding] = detectLearningGaps({ ...input, postponedTopics: [], missed: [], healths: [health(inactive)], details: [inactive] });
    expect(finding).toMatchObject({ code: "inactiveGoal", severity: "low" });
  });
});

describe("Test 7: no available time", () => {
  const topics = topicList(4, 0);
  const days = Array.from({ length: 3 }, (_, i) => `2026-10-${16 + i}`);
  // Every study window is fully booked by another subject.
  const booked: PracticeCommitment[] = days.map((day, i) => ({
    blockId: uuid(800 + i), date: day, title: "Spring Boot", subjectId: SPRING,
    startsAt: at(day, "16:00"), endsAt: at(day, "21:30"),
  }));
  it("never invents time or overlaps, and offers trade-offs instead", () => {
    const plan = planPracticeSessions({
      audit: audit(topics), attention: { level: "needsPractice", reportedAt: null, improved: false, topics: {} },
      preferences: { ...prefs, dailyTargetMinutes: 240 }, commitments: booked, timezone: TZ, now: NOW,
      request: { sessions: 3, minutes: 45, horizonDays: 3 },
    });
    expect(plan.sessions).toEqual([]);
    expect(plan).toMatchObject({ shortfall: 3, constraint: "noFreeTime" });
    expect(plan.tradeoffs.map((t) => t.blockId)).toEqual([uuid(800), uuid(801), uuid(802)]);
    // Commitments are untouched; trade-offs are only suggestions.
    expect(booked).toHaveLength(3);
  });
  it("reports the daily target as the constraint when free slots exist but the day is full", () => {
    const shortDays: PracticeCommitment[] = days.map((day, i) => ({
      blockId: uuid(900 + i), date: day, title: "SQL", subjectId: SQL,
      startsAt: at(day, "12:00"), endsAt: at(day, "13:45"),
    }));
    const plan = planPracticeSessions({
      audit: audit(topics), attention: { level: null, reportedAt: null, improved: false, topics: {} },
      preferences: prefs, commitments: shortDays, timezone: TZ, now: NOW,
      request: { sessions: 2, minutes: 45, horizonDays: 3 },
    });
    expect(plan).toMatchObject({ sessions: [], shortfall: 2, constraint: "dailyTarget" });
  });
});

describe("Test 8: long-term improvement", () => {
  const reported: LearningSignal = {
    subjectId: JAVA, topicId: null, level: "needsPractice", source: "chat", at: "2026-10-01T10:00:00Z",
  };
  it("treats a fresh report as needing practice", () => {
    expect(subjectAttention([reported], JAVA, { now: NOW }).level).toBe("needsPractice");
  });
  it("eases after several completed topics, without a new report", () => {
    const result = subjectAttention([reported], JAVA, {
      now: NOW,
      completedAt: ["2026-10-05T10:00:00Z", "2026-10-08T10:00:00Z", "2026-10-12T10:00:00Z", "2026-09-01T10:00:00Z"],
    });
    expect(result).toMatchObject({ level: "gettingThere", improved: true });
  });
  it("follows a later confident report and stops planning extra practice", () => {
    const signals = appendSignal([reported], { ...reported, level: "confident", source: "checkIn", at: "2026-10-14T10:00:00Z" });
    expect(signals).toHaveLength(1);
    const attention = subjectAttention(signals, JAVA, { now: NOW });
    expect(attention.level).toBe("confident");
    expect(choosePracticeTopics(audit(topicList(4, 4)), attention).chosen).toEqual([]);
  });
  it("never labels a subject permanently: old reports expire", () => {
    expect(subjectAttention([reported], JAVA, { now: Date.parse("2026-12-15T00:00:00Z") }).level).toBeNull();
  });
  it("keeps the store bounded and removable", () => {
    let signals: LearningSignal[] = [];
    for (let i = 0; i < MAX_SIGNALS + 10; i++)
      signals = appendSignal(signals, { ...reported, subjectId: uuid(3000 + i), at: new Date(NOW + i * 1000).toISOString() });
    expect(signals).toHaveLength(MAX_SIGNALS);
    expect(removeSignals(signals, uuid(3069))).toHaveLength(MAX_SIGNALS - 1);
  });
  it("survives malformed stored reports without breaking preferences", () => {
    expect(aiPreferenceSchema.parse({ learningSignals: [{ bogus: true }] }).learningSignals).toEqual([]);
  });
  it("reviews completed topics when difficulty persists (completion is not mastery)", () => {
    const result = choosePracticeTopics(audit(topicList(3, 3)), {
      level: "needsPractice", reportedAt: reported.at, improved: false, topics: {},
    });
    expect(result.chosen.map((c) => c.reason)).toEqual(["review", "review", "review"]);
  });
});

describe("indirect requests are recognized as plan signals", () => {
  it.each([
    "I'm bad at Advanced Java.",
    "I wish I had more time for SQL.",
    "I keep skipping concurrency.",
    "I've been studying Spring Boot, but I'm not sure I'm making progress.",
    "I'm really struggling with recursion",
    "I need more practice with joins",
  ])("%s", (message) => {
    const result = classifyIntent(message);
    expect(result.intents).toContain("struggle");
    expect(result.planning).toBe(true);
  });
  it("still routes falling behind to recovery", () => {
    expect(classifyIntent("I'm falling behind").intents).toContain("recovery");
  });
  it("does not misread neutral messages", () => {
    expect(classifyIntent("Explain Java streams").intents).not.toContain("struggle");
  });
});
