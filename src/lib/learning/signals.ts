import { z } from "zod";
/**
 * Learner-reported understanding. These are self-reports, never mastery scores:
 * Acadence has no assessment records, so nothing here claims verified knowledge.
 */
export const confidenceLevels = [
  "needsPractice",
  "gettingThere",
  "confident",
] as const;
export type ConfidenceLevel = (typeof confidenceLevels)[number];
export const learningSignalSchema = z.object({
  subjectId: z.uuid(),
  topicId: z.uuid().nullable().default(null),
  level: z.enum(confidenceLevels),
  /** chat: approved from an Aven proposal; checkIn: the optional after-session question. */
  source: z.enum(["chat", "checkIn"]),
  at: z.iso.datetime(),
});
export type LearningSignal = z.infer<typeof learningSignalSchema>;
export const MAX_SIGNALS = 60;
/** A report older than this no longer steers planning, so one statement never labels a subject permanently. */
export const SIGNAL_TTL_DAYS = 60;
/** Completed topics after a difficulty report that count as evidence of improvement. */
export const IMPROVEMENT_TOPICS = 3;

/** The latest report replaces an earlier one for the same subject and topic; the list stays bounded. */
export function appendSignal(
  signals: readonly LearningSignal[],
  signal: LearningSignal,
) {
  return [
    ...signals.filter(
      (item) =>
        item.subjectId !== signal.subjectId || item.topicId !== signal.topicId,
    ),
    signal,
  ]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-MAX_SIGNALS);
}
export function removeSignals(
  signals: readonly LearningSignal[],
  subjectId: string,
  topicId?: string | null,
) {
  return signals.filter(
    (item) =>
      item.subjectId !== subjectId ||
      (topicId !== undefined && item.topicId !== topicId),
  );
}
export interface SubjectAttention {
  /** null when there is no current report. */
  level: ConfidenceLevel | null;
  reportedAt: string | null;
  /** The report was needsPractice, but topics completed since then lowered it. */
  improved: boolean;
  topics: Record<string, ConfidenceLevel>;
}
/**
 * Current self-reported attention for one subject.
 * - Reports older than SIGNAL_TTL_DAYS are ignored.
 * - The newest report (subject or topic scope) sets the subject level.
 * - needsPractice becomes gettingThere once IMPROVEMENT_TOPICS topics were completed after it.
 */
export function subjectAttention(
  signals: readonly LearningSignal[],
  subjectId: string,
  context: { now: number; completedAt?: readonly (string | null)[] },
): SubjectAttention {
  const current = signals
    .filter(
      (item) =>
        item.subjectId === subjectId &&
        context.now - Date.parse(item.at) <= SIGNAL_TTL_DAYS * 86400000,
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const topics: Record<string, ConfidenceLevel> = {};
  for (const item of current) if (item.topicId) topics[item.topicId] = item.level;
  const latest = current.at(-1);
  if (!latest) return { level: null, reportedAt: null, improved: false, topics };
  const completedSince = (context.completedAt ?? []).filter(
    (at) => at && Date.parse(at) > Date.parse(latest.at),
  ).length;
  const improved =
    latest.level === "needsPractice" && completedSince >= IMPROVEMENT_TOPICS;
  return {
    level: improved ? "gettingThere" : latest.level,
    reportedAt: latest.at,
    improved,
    topics,
  };
}
