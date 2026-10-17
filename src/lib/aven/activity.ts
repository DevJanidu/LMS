/**
 * User-safe activity categories for real backend tool events. Tool names, arguments and
 * results never reach the client; only these categories (translated in aven.activity).
 */
const categories: Record<string, string> = {
  getUserGoals: "goals",
  getGoalDetails: "goals",
  getGoalProgress: "goals",
  getGoalHealth: "goals",
  getNextBestAction: "goals",
  getCalendar: "calendar",
  getStudySchedule: "calendar",
  getUpcomingDeadlines: "calendar",
  getAssignments: "calendar",
  listReminders: "calendar",
  getStudyHistory: "history",
  getWeeklyAnalytics: "history",
  getLearningGaps: "history",
  getStudyCircles: "history",
  getSubjects: "resources",
  getTopics: "resources",
  getStudyResources: "resources",
  auditTopicCoverage: "resources",
  getUserProfile: "preferences",
  getNotificationPreferences: "preferences",
  proposeStudySchedule: "studyPlan",
  proposeGoalPlan: "studyPlan",
  proposeGoalHierarchy: "studyPlan",
  proposePracticeSessions: "studyPlan",
  createStudySchedule: "studyPlan",
  scheduleStudySessions: "studyPlan",
  moveStudySessions: "conflicts",
  rescheduleStudySession: "conflicts",
  cancelStudySessions: "conflicts",
  showChecklist: "composing",
  showQuiz: "composing",
  showFlashcards: "composing",
  showDiagram: "composing",
  showStudyTargets: "composing",
};
export const ACTIVITY_CATEGORIES = [
  "working",
  "goals",
  "calendar",
  "history",
  "resources",
  "preferences",
  "studyPlan",
  "conflicts",
  "changes",
  "composing",
] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export const activityCategory = (tool: string): ActivityCategory =>
  (categories[tool] as ActivityCategory | undefined) ??
  (tool === "working" ? "working" : "changes");
/** Accepts a category from the network or storage; anything unknown becomes "working". */
export const knownActivity = (value: unknown): ActivityCategory =>
  ACTIVITY_CATEGORIES.includes(value as ActivityCategory)
    ? (value as ActivityCategory)
    : "working";
