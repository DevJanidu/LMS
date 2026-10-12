"use client";
import { useTranslations } from "next-intl";
/** Maps real backend tool events to user-facing phrases; tool arguments are never shown. */
const categories: Record<string, string> = {
  getUserGoals: "goals",
  getGoalDetails: "goals",
  getGoalProgress: "goals",
  getCalendar: "calendar",
  getStudySchedule: "calendar",
  getUpcomingDeadlines: "calendar",
  getAssignments: "calendar",
  getStudyHistory: "history",
  getWeeklyAnalytics: "history",
  getSubjects: "resources",
  getTopics: "resources",
  getStudyResources: "resources",
  getUserProfile: "preferences",
  getNotificationPreferences: "preferences",
  proposeStudySchedule: "studyPlan",
  proposeGoalPlan: "studyPlan",
  createStudySchedule: "studyPlan",
  moveStudySessions: "conflicts",
  rescheduleStudySession: "conflicts",
  cancelStudySessions: "conflicts",
};
export const activityCategory = (tool: string) =>
  categories[tool] ?? (tool === "working" ? "working" : "changes");
export default function AvenActivity({ name }: { name: string }) {
  const t = useTranslations("aven.activity");
  return (
    <div className="aven-activity" aria-hidden="true">
      <span className="aven-activity-dots">
        <span />
        <span />
        <span />
      </span>
      <span>{t(name)}</span>
    </div>
  );
}
