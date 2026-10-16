import type { ConfidenceLevel } from "./signals";
/**
 * Topic coverage from authoritative records. Planned, studied and completed are separate
 * facts; mastery is never inferred because there are no assessment records.
 */
export interface CoverageTopic {
  id: string;
  title: string;
  status: "not_started" | "in_progress" | "completed";
  targetDate: string | null;
  completedAt: string | null;
  sortOrder: number;
}
export interface CoverageOccurrence {
  topicId: string | null;
  date: string;
  startsAt: string;
  endsAt: string;
}
export interface CoveragePostponement {
  topicId: string | null;
  date: string;
  kind: "moved" | "cancelled" | "skipped";
}
export interface CoverageStudy {
  topicId: string | null;
  startedAt: string;
  seconds: number;
}
/** A goal task for this topic that waits on unfinished prerequisites. */
export interface CoverageGoalTask {
  topicId: string;
  taskTitle: string;
  goalId: string;
  goalTitle: string;
  blockedBy: string[];
}
export interface CoverageInput {
  subject: { id: string; title: string; targetDate: string | null };
  topics: CoverageTopic[];
  /** Calendar occurrences in the audit window (past and upcoming). */
  occurrences: CoverageOccurrence[];
  postponements: CoveragePostponement[];
  studies: CoverageStudy[];
  goalTasks: CoverageGoalTask[];
  /** Topics with a goal task already linked to a calendar session. */
  goalScheduledTopicIds: string[];
  confidence: Record<string, ConfidenceLevel>;
  today: string;
  now: number;
}
export const POSTPONED_THRESHOLD = 2;
export interface TopicCoverage {
  id: string;
  title: string;
  targetDate: string | null;
  planned: boolean;
  studied: boolean;
  completed: boolean;
  overdue: boolean;
  upcomingSessions: number;
  pastSessionsWithoutCompletion: number;
  postponements: number;
  studiedMinutes: number;
  /** Learner's own report; not a measured mastery level. */
  selfReportedConfidence: ConfidenceLevel | null;
  blockedBy: string[];
}
export function auditTopicCoverage(input: CoverageInput) {
  const topics = [...input.topics].sort((a, b) => a.sortOrder - b.sortOrder);
  const scheduledByGoal = new Set(input.goalScheduledTopicIds);
  const rows: TopicCoverage[] = topics.map((topic) => {
    const sessions = input.occurrences.filter((o) => o.topicId === topic.id);
    const upcoming = sessions.filter((o) => Date.parse(o.startsAt) > input.now);
    const past = sessions.filter((o) => Date.parse(o.endsAt) <= input.now);
    const seconds = input.studies
      .filter((study) => study.topicId === topic.id)
      .reduce((sum, study) => sum + study.seconds, 0);
    const completed = topic.status === "completed";
    return {
      id: topic.id,
      title: topic.title,
      targetDate: topic.targetDate,
      planned: sessions.length > 0 || scheduledByGoal.has(topic.id),
      studied: seconds > 0 || topic.status !== "not_started",
      completed,
      overdue:
        !completed && Boolean(topic.targetDate && topic.targetDate < input.today),
      upcomingSessions: upcoming.length,
      pastSessionsWithoutCompletion: completed ? 0 : past.length,
      postponements: input.postponements.filter((p) => p.topicId === topic.id)
        .length,
      studiedMinutes: Math.round(seconds / 60),
      selfReportedConfidence: input.confidence[topic.id] ?? null,
      blockedBy: [
        ...new Set(
          input.goalTasks
            .filter((task) => task.topicId === topic.id)
            .flatMap((task) => task.blockedBy),
        ),
      ],
    };
  });
  const open = rows.filter((row) => !row.completed);
  const pick = (items: TopicCoverage[]) =>
    items.map(({ id, title, targetDate }) => ({ id, title, targetDate }));
  const neverScheduled = open.filter((row) => !row.planned);
  const overdue = open.filter((row) => row.overdue);
  const postponed = open.filter((row) => row.postponements >= POSTPONED_THRESHOLD);
  const plannedNotCompleted = open.filter(
    (row) => row.pastSessionsWithoutCompletion > 0,
  );
  const prerequisiteGaps = input.goalTasks
    .filter(
      (task) =>
        task.blockedBy.length &&
        open.some((row) => row.id === task.topicId),
    )
    .map((task) => ({
      topicId: task.topicId,
      topicTitle: rows.find((row) => row.id === task.topicId)!.title,
      goalId: task.goalId,
      goalTitle: task.goalTitle,
      taskTitle: task.taskTitle,
      blockedBy: task.blockedBy,
    }));
  const upcomingCoverage = input.occurrences
    .filter((o) => o.topicId && Date.parse(o.startsAt) > input.now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 20)
    .map((o) => ({
      topicId: o.topicId!,
      title: rows.find((row) => row.id === o.topicId)?.title ?? "",
      startsAt: o.startsAt,
      endsAt: o.endsAt,
    }));
  return {
    subject: input.subject,
    counts: {
      required: rows.length,
      completed: rows.length - open.length,
      remaining: open.length,
      inProgress: open.filter((row) => row.studied).length,
      overdue: overdue.length,
      neverScheduled: neverScheduled.length,
      plannedNotCompleted: plannedNotCompleted.length,
      repeatedlyPostponed: postponed.length,
      selfReportedConfident: rows.filter(
        (row) => row.selfReportedConfidence === "confident",
      ).length,
    },
    neverScheduled: pick(neverScheduled),
    overdue: pick(overdue),
    repeatedlyPostponed: postponed.map(({ id, title, postponements }) => ({
      id,
      title,
      postponements,
    })),
    plannedNotCompleted: pick(plannedNotCompleted),
    upcomingCoverage,
    prerequisiteGaps,
    topics: rows,
    mastery: {
      measured: false as const,
      note: "No quiz or assessment records exist. Completed means the student marked the topic complete; confidence is self-reported. Never describe either as mastery.",
    },
  };
}
export type TopicCoverageAudit = ReturnType<typeof auditTopicCoverage>;
