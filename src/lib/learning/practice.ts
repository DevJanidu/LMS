import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";
import { committedMinutes, overlaps } from "@/lib/aven/planning";
import type { AiPreferences } from "@/lib/aven/validation";
import type { TopicCoverageAudit } from "./coverage";
import type { SubjectAttention } from "./signals";
/**
 * Extra practice for a subject (adaptive rescheduling). Deterministic:
 * - topics are chosen by evidence: reported difficulty, repeated postponement, overdue,
 *   planned but unfinished, never scheduled, then remaining open topics. With every topic
 *   complete, reported difficulty leads to review sessions (completion is not mastery).
 * - topics whose goal tasks wait on prerequisites are skipped and reported.
 * - slots stay inside preferred study hours on study days, never overlap existing
 *   commitments (15-minute buffer), keep each day within the daily target and add at most
 *   one practice session per day.
 * - when time runs out it reports the shortfall and movable sessions; nothing is deleted.
 */
export type PracticeReason =
  | "reportedDifficulty"
  | "postponed"
  | "overdue"
  | "plannedNotCompleted"
  | "neverScheduled"
  | "remaining"
  | "review";
export interface PracticeCommitment {
  blockId: string;
  date: string;
  title: string;
  subjectId: string | null;
  startsAt: string;
  endsAt: string;
}
export interface PracticeRequest {
  sessions: number;
  minutes: number;
  horizonDays: number;
}
const BUFFER = 15 * 60000;
export function choosePracticeTopics(
  audit: TopicCoverageAudit,
  attention: SubjectAttention,
) {
  const chosen: { id: string; title: string; reason: PracticeReason }[] = [];
  const skippedBlocked: { id: string; title: string; blockedBy: string[] }[] = [];
  const add = (
    rows: TopicCoverageAudit["topics"],
    reason: PracticeReason,
  ) => {
    for (const row of rows) {
      if (chosen.some((item) => item.id === row.id)) continue;
      if (row.blockedBy.length) {
        if (!skippedBlocked.some((item) => item.id === row.id))
          skippedBlocked.push({ id: row.id, title: row.title, blockedBy: row.blockedBy });
        continue;
      }
      chosen.push({ id: row.id, title: row.title, reason });
    }
  };
  const open = audit.topics.filter((row) => !row.completed);
  const difficult = (row: TopicCoverageAudit["topics"][number]) =>
    attention.topics[row.id] === "needsPractice" ||
    row.selfReportedConfidence === "needsPractice";
  add(open.filter(difficult), "reportedDifficulty");
  add(
    open
      .filter((row) => row.postponements >= 2)
      .sort((a, b) => b.postponements - a.postponements),
    "postponed",
  );
  add(open.filter((row) => row.overdue), "overdue");
  add(
    open.filter(
      (row) => row.pastSessionsWithoutCompletion > 0 && !row.upcomingSessions,
    ),
    "plannedNotCompleted",
  );
  add(open.filter((row) => !row.planned), "neverScheduled");
  add(open.filter((row) => !row.upcomingSessions), "remaining");
  if (!chosen.length && attention.level && attention.level !== "confident")
    add(
      audit.topics
        .filter(
          (row) =>
            row.completed && row.selfReportedConfidence !== "confident",
        )
        .sort(
          (a, b) =>
            Number(difficult(b)) - Number(difficult(a)) ||
            a.studiedMinutes - b.studiedMinutes,
        ),
      "review",
    );
  return { chosen, skippedBlocked };
}
export function planPracticeSessions(input: {
  audit: TopicCoverageAudit;
  attention: SubjectAttention;
  preferences: Pick<
    AiPreferences,
    "preferredStudyStart" | "preferredStudyEnd" | "dailyTargetMinutes" | "studyDays"
  >;
  commitments: PracticeCommitment[];
  timezone: string;
  now: number;
  request: PracticeRequest;
}) {
  const { chosen, skippedBlocked } = choosePracticeTopics(
    input.audit,
    input.attention,
  );
  const { preferences, timezone, now, request } = input;
  const sessions: {
    topicId: string;
    topicTitle: string;
    reason: PracticeReason;
    startsAt: string;
    endsAt: string;
  }[] = [];
  let limitedByDailyTarget = false;
  const today = localDay(now, timezone);
  for (
    let offset = 0;
    offset < Math.min(14, request.horizonDays) &&
    sessions.length < request.sessions &&
    chosen.length;
    offset++
  ) {
    const day = shiftDay(today, offset);
    if (!preferences.studyDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay()))
      continue;
    const windowEnd = Date.parse(
      zonedToUtc(`${day}T${preferences.preferredStudyEnd}`, timezone),
    );
    let cursor = Math.max(
      // Leave time to prepare; round to the next quarter hour.
      Math.ceil((now + 30 * 60000) / (15 * 60000)) * 15 * 60000,
      Date.parse(zonedToUtc(`${day}T${preferences.preferredStudyStart}`, timezone)),
    );
    const length = request.minutes * 60000;
    let slot: { startsAt: string; endsAt: string } | null = null;
    while (cursor + length <= windowEnd) {
      const candidate = {
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(cursor + length).toISOString(),
      };
      const conflict = input.commitments
        .filter((item) =>
          overlaps(
            {
              startsAt: new Date(cursor - BUFFER).toISOString(),
              endsAt: new Date(cursor + length + BUFFER).toISOString(),
            },
            item,
          ),
        )
        .sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
      if (!conflict) {
        slot = candidate;
        break;
      }
      cursor = Date.parse(conflict.endsAt) + BUFFER;
    }
    if (!slot) continue;
    const load =
      committedMinutes(day, timezone, input.commitments) + request.minutes;
    if (load > preferences.dailyTargetMinutes) {
      limitedByDailyTarget = true;
      continue;
    }
    const topic = chosen[sessions.length % chosen.length];
    sessions.push({
      topicId: topic.id,
      topicTitle: topic.title,
      reason: topic.reason,
      ...slot,
    });
  }
  const shortfall = chosen.length ? request.sessions - sessions.length : 0;
  const horizonEnd = shiftDay(today, Math.min(14, request.horizonDays));
  // Other subjects' upcoming sessions are possible trade-offs; they are only suggestions.
  const tradeoffs = shortfall
    ? input.commitments
        .filter(
          (item) =>
            Date.parse(item.startsAt) > now &&
            item.date < horizonEnd &&
            item.subjectId !== input.audit.subject.id,
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .slice(0, 3)
        .map(({ blockId, date, title, startsAt, endsAt }) => ({
          blockId,
          date,
          title,
          startsAt,
          endsAt,
        }))
    : [];
  return {
    sessions,
    shortfall,
    constraint: !shortfall
      ? null
      : limitedByDailyTarget
        ? ("dailyTarget" as const)
        : ("noFreeTime" as const),
    tradeoffs,
    skippedBlocked,
    nothingToPractice: !chosen.length,
  };
}
export type PracticePlan = ReturnType<typeof planPracticeSessions>;
