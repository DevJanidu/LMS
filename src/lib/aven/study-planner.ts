import "server-only";
import { getScheduleBlocksInRange } from "@/lib/services/lists";
import { getOccurrences } from "@/lib/schedule";
import { shiftDay, wallTime } from "@/lib/analytics";
import { planStudySessions } from "@/lib/learning/slots";
import { getAvenPreferences } from "./preferences";
export interface SessionRequest {
  subjects: { subjectId: string; title: string; sessions: number }[];
  minutes: number;
  from: string;
  to: string;
  earliest: string;
  latest: string;
}
/**
 * Deterministic multi-subject planning against the student's real calendar: free slots
 * only, study days and the daily target respected, nothing existing moved. Shared by the
 * scheduleStudySessions tool and the interactive planner, so adjusting the planner never
 * needs the model and always applies the same rules.
 */
export async function planSubjectSessions(userId: string, timezone: string, request: SessionRequest) {
  const { ai } = await getAvenPreferences(userId);
  const commitments = getOccurrences(
    await getScheduleBlocksInRange(userId, { from: request.from, to: shiftDay(request.to, 1) }, timezone),
    request.from,
    request.to,
  ).map((item) => ({
    blockId: item.block.id,
    date: item.date,
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
  }));
  const plan = planStudySessions({
    ...request,
    studyDays: ai.studyDays,
    dailyTargetMinutes: ai.dailyTargetMinutes,
    commitments,
    timezone,
    now: Date.now(),
  });
  const facts = {
    window: { from: request.from, to: request.to, earliest: request.earliest, latest: request.latest, studyDays: ai.studyDays },
    subjects: request.subjects,
    minutes: request.minutes,
    dailyTargetMinutes: ai.dailyTargetMinutes,
    unplaced: plan.unplaced,
    constraint: plan.constraint,
    tradeoffs: plan.tradeoffs.map((item) => ({
      title: item.title,
      localStartsAt: wallTime(item.startsAt, timezone),
    })),
  };
  return { plan, facts };
}
/** The approval proposal for a plan; approving it saves through the calendar service. */
export function scheduleProposal(explanation: string, plan: Awaited<ReturnType<typeof planSubjectSessions>>["plan"]) {
  return {
    kind: "schedule" as const,
    goalId: null,
    expectedVersion: 0,
    explanation,
    sessions: plan.sessions.map((item) => ({
      title: item.title,
      taskId: null,
      subjectId: item.subjectId,
      topicId: null,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    })),
  };
}
