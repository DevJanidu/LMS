import type { Workspace } from "@/types";
import { dailySeconds, localDay, totalSeconds, weekStart } from "./index";
/** Aggregate-only platform calculations for the mock admin screens. */
export function adminMetrics(data: Workspace, now: number) {
  const today = localDay(now, data.user.timezone);
  const week = weekStart(today, data.user.weekStartDay);
  const month = `${today.slice(0, 7)}-01`;
  const sessions = data.sessions.filter(
    (session) => session.status === "valid" && session.durationSeconds >= 60,
  );
  const active = (from: string) =>
    new Set(
      sessions
        .filter(
          (session) =>
            localDay(session.startedAt, data.user.timezone) >= from &&
            localDay(session.startedAt, data.user.timezone) <= today,
        )
        .map((session) => session.userId),
    ).size;
  const dailyActive = (day: string) =>
    data.users.filter(
      (user) =>
        (dailySeconds(
          sessions.filter((session) => session.userId === user.id),
          data.user.timezone,
        )[day] ?? 0) > 0,
    ).length;
  return {
    today,
    totalUsers: data.users.length,
    activeUsers: active(week),
    newUsers: data.users.filter(
      (user) => localDay(user.createdAt, data.user.timezone) >= week,
    ).length,
    sessionsToday: sessions.filter(
      (session) => localDay(session.startedAt, data.user.timezone) === today,
    ).length,
    totalHours: Math.round(totalSeconds(sessions) / 3600),
    activeSubjects: data.subjects.filter(
      (subject) => subject.status === "active",
    ).length,
    daily: active(today),
    weekly: active(week),
    monthly: active(month),
    averageMinutes: sessions.length
      ? Math.round(totalSeconds(sessions) / sessions.length / 60)
      : 0,
    subjectsCreated: data.subjects.length,
    topicsCompleted: data.topics.filter((topic) => topic.status === "completed")
      .length,
    dailyActive,
  };
}
