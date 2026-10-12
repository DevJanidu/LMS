import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";
import type { GoalDetail } from "@/lib/goals/model";
import type { AiPreferences, AvenProposal } from "./validation";
interface Slot {
  startsAt: string;
  endsAt: string;
}
export function overlaps(a: Slot, b: Slot) {
  return (
    Date.parse(a.startsAt) < Date.parse(b.endsAt) &&
    Date.parse(a.endsAt) > Date.parse(b.startsAt)
  );
}
export function committedMinutes(
  day: string,
  timezone: string,
  commitments: Slot[],
) {
  const start = Date.parse(zonedToUtc(`${day}T00:00`, timezone)),
    end = Date.parse(zonedToUtc(`${shiftDay(day, 1)}T00:00`, timezone));
  return commitments.reduce(
    (total, slot) =>
      total +
      Math.max(
        0,
        Math.min(end, Date.parse(slot.endsAt)) -
          Math.max(start, Date.parse(slot.startsAt)),
      ) /
        60000,
    0,
  );
}
export function validateSchedule(
  sessions: Slot[],
  commitments: Slot[],
  now: number,
  dailyMinutes: number,
  timezone: string,
) {
  const totals = new Map<string, number>();
  for (let index = 0; index < sessions.length; index++) {
    const item = sessions[index],
      start = Date.parse(item.startsAt),
      end = Date.parse(item.endsAt);
    if (
      start < now ||
      end <= start ||
      end - start > 120 * 60000 ||
      localDay(start, timezone) !== localDay(end - 1, timezone)
    )
      throw new Error("invalidSchedule");
    if (
      commitments.some((existing) => overlaps(item, existing)) ||
      sessions.slice(0, index).some((existing) => overlaps(item, existing))
    )
      throw new Error("scheduleOverlap");
    const day = localDay(start, timezone),
      total =
        (totals.get(day) ?? committedMinutes(day, timezone, commitments)) +
        (end - start) / 60000;
    if (total > dailyMinutes) throw new Error("scheduleOverloaded");
    totals.set(day, total);
  }
}
export function proposeAdaptiveSchedule(
  detail: GoalDetail,
  preferences: AiPreferences,
  commitments: Slot[],
  timezone: string,
  now: number,
  days = 7,
  plannedMinutes: Record<string, number> = {},
):
  | (Extract<AvenProposal, { kind: "schedule" }> & { unscheduledTasks: number })
  | { unscheduled: number; sessions: [] } {
  const pending = detail.tasks.filter(
    (t) =>
      t.status !== "cancelled" &&
      (detail.progress.taskProgress[t.id] ?? 0) < 100 &&
      !detail.progress.blockedIds.includes(t.id) &&
      (t.estimatedMinutes || 30) -
        Math.floor(t.actualSeconds / 60) -
        (plannedMinutes[t.id] ?? 0) >
        0,
  );
  const ordered = pending.sort(
    (a, b) =>
      (a.dueDate ?? detail.goal.targetDate).localeCompare(
        b.dueDate ?? detail.goal.targetDate,
      ) || (a.priority === "high" ? -1 : 1),
  );
  const sessions: Extract<AvenProposal, { kind: "schedule" }>["sessions"] = [];
  let taskIndex = 0,
    remaining = Math.max(
      15,
      (ordered[0]?.estimatedMinutes || 30) -
        Math.floor((ordered[0]?.actualSeconds ?? 0) / 60) -
        (plannedMinutes[ordered[0]?.id] ?? 0),
    );
  const today = localDay(now, timezone);
  for (
    let offset = 0;
    offset < Math.min(14, days) && taskIndex < ordered.length;
    offset++
  ) {
    const day = shiftDay(today, offset),
      weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (
      !preferences.studyDays.includes(weekday) ||
      day > detail.goal.targetDate
    )
      continue;
    let cursor = Math.max(
      now + 5 * 60000,
      Date.parse(
        zonedToUtc(`${day}T${preferences.preferredStudyStart}`, timezone),
      ),
    );
    const end = Date.parse(
      zonedToUtc(`${day}T${preferences.preferredStudyEnd}`, timezone),
    );
    let used = committedMinutes(day, timezone, commitments);
    while (
      cursor + 15 * 60000 <= end &&
      used < preferences.dailyTargetMinutes &&
      taskIndex < ordered.length &&
      sessions.length < 30
    ) {
      const minutes = Math.min(
        60,
        remaining,
        preferences.dailyTargetMinutes - used,
        Math.floor((end - cursor) / 60000),
      );
      if (minutes < 15) break;
      const slot = {
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(cursor + minutes * 60000).toISOString(),
      };
      const conflict = commitments.find((existing) => overlaps(slot, existing));
      if (conflict) {
        cursor = Date.parse(conflict.endsAt) + 15 * 60000;
        continue;
      }
      const task = ordered[taskIndex];
      sessions.push({
        ...slot,
        title: task.title,
        taskId: task.id,
        subjectId: task.subjectId,
        topicId: task.topicId,
      });
      used += minutes;
      remaining -= minutes;
      cursor += (minutes + 15) * 60000;
      if (remaining <= 0) {
        taskIndex++;
        remaining = Math.max(
          15,
          (ordered[taskIndex]?.estimatedMinutes || 30) -
            Math.floor((ordered[taskIndex]?.actualSeconds ?? 0) / 60) -
            (plannedMinutes[ordered[taskIndex]?.id] ?? 0),
        );
      }
    }
  }
  if (!sessions.length) return { unscheduled: ordered.length, sessions: [] };
  return {
    kind: "schedule",
    goalId: detail.goal.id,
    expectedVersion: detail.goal.version,
    explanation: "",
    unscheduledTasks: ordered.length - taskIndex,
    sessions,
  };
}
