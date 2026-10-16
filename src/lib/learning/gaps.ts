import { weekKey } from "@/lib/aven/goal-monitor";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalHealth } from "./goal-health";
import type { ConfidenceLevel } from "./signals";
/**
 * Deterministic detection of missed, neglected and mis-prioritized work (monitoring layer A).
 * No model call happens here. Severity follows fixed rules:
 *   critical  an overdue prerequisite holds back work due within 7 days
 *   high      past the goal target; overdue milestone with 2+ open tasks; time spent elsewhere
 *             while an overdue prerequisite waits
 *   medium    overdue milestone with 1 open task; overdue task; topic postponed 2+ times;
 *             2+ missed sessions of one subject this week; reported difficulty with no
 *             practice planned; time spent elsewhere while an overdue task waits
 *   low       no recent progress on a goal without a deadline in the next 14 days
 * The fingerprint changes only when the underlying facts change, so alerts deduplicate.
 */
export type Severity = "critical" | "high" | "medium" | "low";
export type LearningFinding = {
  severity: Severity;
  fingerprint: string;
  goalId?: string;
  taskId?: string;
  subjectId?: string;
  topicId?: string;
} & (
  | {
      code: "overduePrerequisite";
      goalTitle: string;
      task: string;
      dueDate: string;
      blocks: string[];
      nextDueDate: string;
    }
  | { code: "pastTarget"; goalTitle: string; targetDate: string; openTasks: number }
  | {
      code: "overdueMilestone";
      goalTitle: string;
      milestone: string;
      dueDate: string;
      openTasks: number;
    }
  | { code: "overdueTask"; goalTitle: string; task: string; count: number }
  | {
      code: "postponedTopic";
      subject: string;
      topic: string;
      postponements: number;
    }
  | { code: "missedSessions"; subject: string; count: number }
  | {
      code: "priorityMismatch";
      goalTitle: string;
      task: string;
      dueDate: string;
      prerequisite: boolean;
      busySubject: string;
      busyMinutes: number;
    }
  | {
      code: "reportedDifficulty";
      subject: string;
      level: ConfidenceLevel;
      openTopics: number;
    }
  | { code: "inactiveGoal"; goalTitle: string; days: number }
);
export interface GapInput {
  today: string;
  healths: GoalHealth[];
  details: GoalDetail[];
  subjects: { id: string; title: string }[];
  postponedTopics: {
    topicId: string;
    topic: string;
    subjectId: string;
    count: number;
  }[];
  /** Past sessions in the last 7 days with no attendance and no same-subject study. */
  missed: { subjectId: string; date: string }[];
  /** Verified timer and manual minutes per subject over the last 7 days. */
  studyMinutesBySubject: Record<string, number>;
  attention: {
    subjectId: string;
    level: ConfidenceLevel;
    reportedAt: string;
    openTopics: number;
    upcomingSessions: number;
  }[];
}
const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const BUSY_MINUTES = 60;
export function detectLearningGaps(input: GapInput): LearningFinding[] {
  const week = weekKey(input.today);
  const subjectTitle = (id: string) =>
    input.subjects.find((subject) => subject.id === id)?.title ?? "";
  const findings: LearningFinding[] = [];
  for (const health of input.healths) {
    const detail = input.details.find((item) => item.goal.id === health.goalId);
    for (const reason of health.reasons) {
      if (reason.code === "overdueBlocksUpcoming")
        findings.push({
          code: "overduePrerequisite",
          severity: "critical",
          fingerprint: `prerequisite:${reason.taskId}:${reason.dueDate}`,
          goalId: health.goalId,
          taskId: reason.taskId,
          subjectId:
            detail?.tasks.find((task) => task.id === reason.taskId)?.subjectId ??
            undefined,
          goalTitle: health.title,
          task: reason.task,
          dueDate: reason.dueDate,
          blocks: reason.blocks,
          nextDueDate: reason.nextDueDate,
        });
      else if (reason.code === "pastTarget")
        findings.push({
          code: "pastTarget",
          severity: "high",
          fingerprint: `pastTarget:${health.goalId}:${reason.targetDate}`,
          goalId: health.goalId,
          goalTitle: health.title,
          targetDate: reason.targetDate,
          openTasks: reason.openTasks,
        });
      else if (reason.code === "overdueMilestone")
        findings.push({
          code: "overdueMilestone",
          severity: reason.openTasks >= 2 ? "high" : "medium",
          fingerprint: `milestone:${reason.milestoneId}:${reason.dueDate}:${reason.openTasks}`,
          goalId: health.goalId,
          goalTitle: health.title,
          milestone: reason.milestone,
          dueDate: reason.dueDate,
          openTasks: reason.openTasks,
        });
      else if (
        reason.code === "overdueTasks" &&
        !health.reasons.some((r) => r.code === "overdueBlocksUpcoming")
      )
        findings.push({
          code: "overdueTask",
          severity: "medium",
          fingerprint: `overdueTask:${reason.taskIds[0]}:${reason.count}`,
          goalId: health.goalId,
          taskId: reason.taskIds[0],
          goalTitle: health.title,
          task: reason.titles[0],
          count: reason.count,
        });
      else if (reason.code === "noRecentProgress") {
        const soon = health.metrics.daysRemaining <= 14;
        findings.push({
          code: "inactiveGoal",
          severity: soon ? "medium" : "low",
          fingerprint: `inactive:${health.goalId}:${week}`,
          goalId: health.goalId,
          goalTitle: health.title,
          days: reason.days,
        });
      }
    }
  }
  for (const item of input.postponedTopics)
    if (item.count >= 2)
      findings.push({
        code: "postponedTopic",
        severity: "medium",
        fingerprint: `postponed:${item.topicId}:${item.count}`,
        subjectId: item.subjectId,
        topicId: item.topicId,
        subject: subjectTitle(item.subjectId),
        topic: item.topic,
        postponements: item.count,
      });
  const missedBySubject = new Map<string, number>();
  for (const item of input.missed)
    missedBySubject.set(item.subjectId, (missedBySubject.get(item.subjectId) ?? 0) + 1);
  for (const [subjectId, count] of missedBySubject)
    if (count >= 2)
      findings.push({
        code: "missedSessions",
        severity: "medium",
        fingerprint: `missed:${subjectId}:${week}:${count}`,
        subjectId,
        subject: subjectTitle(subjectId),
        count,
      });
  // Priority mismatch: verified time went to one subject while overdue work on another received none.
  const overdueSubjects = new Set<string>();
  const overdue: {
    detail: GoalDetail;
    task: GoalDetail["tasks"][number];
    dueDate: string;
    prerequisite: boolean;
  }[] = [];
  for (const detail of input.details) {
    const health = input.healths.find((item) => item.goalId === detail.goal.id);
    if (!health) continue;
    const ids = new Set(
      health.reasons.flatMap((reason) =>
        reason.code === "overdueTasks"
          ? reason.taskIds
          : reason.code === "overdueBlocksUpcoming"
            ? [reason.taskId]
            : [],
      ),
    );
    for (const task of detail.tasks) {
      if (!ids.has(task.id) || !task.subjectId) continue;
      overdueSubjects.add(task.subjectId);
      overdue.push({
        detail,
        task,
        dueDate:
          task.dueDate ??
          detail.milestones.find((m) => m.id === task.milestoneId)?.dueDate ??
          detail.goal.targetDate,
        prerequisite: detail.tasks.some((other) =>
          other.dependencyIds.includes(task.id),
        ),
      });
    }
  }
  const [busySubject, busyMinutes] =
    Object.entries(input.studyMinutesBySubject)
      .filter(([id]) => !overdueSubjects.has(id))
      .sort((a, b) => b[1] - a[1])[0] ?? [];
  if (busySubject && busyMinutes >= BUSY_MINUTES) {
    const neglected = overdue
      .filter(
        ({ task }) => (input.studyMinutesBySubject[task.subjectId!] ?? 0) === 0,
      )
      .sort(
        (a, b) =>
          Number(b.prerequisite) - Number(a.prerequisite) ||
          a.dueDate.localeCompare(b.dueDate),
      )[0];
    if (neglected)
      findings.push({
        code: "priorityMismatch",
        severity: neglected.prerequisite ? "high" : "medium",
        fingerprint: `mismatch:${neglected.task.id}:${busySubject}:${week}`,
        goalId: neglected.detail.goal.id,
        taskId: neglected.task.id,
        subjectId: neglected.task.subjectId!,
        goalTitle: neglected.detail.goal.title,
        task: neglected.task.title,
        dueDate: neglected.dueDate,
        prerequisite: neglected.prerequisite,
        busySubject: subjectTitle(busySubject),
        busyMinutes: Math.round(busyMinutes),
      });
  }
  for (const item of input.attention)
    if (
      item.level === "needsPractice" &&
      item.openTopics > 0 &&
      item.upcomingSessions === 0
    )
      findings.push({
        code: "reportedDifficulty",
        severity: "medium",
        fingerprint: `difficulty:${item.subjectId}:${item.reportedAt}`,
        subjectId: item.subjectId,
        subject: subjectTitle(item.subjectId),
        level: item.level,
        openTopics: item.openTopics,
      });
  return findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
