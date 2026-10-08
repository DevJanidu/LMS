export type SubjectColor = "brand" | "success" | "orange" | "purple";
export interface User {
  id: string;
  name: string;
  email: string;
  role: "learner" | "admin";
  timezone: string;
  learningContext?: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
  weeklyTargetMinutes: number;
  theme: "light" | "dark" | "auto";
  weekStartDay: 0 | 1;
  reminders: boolean;
  longestStreak: number;
}
export interface Subject {
  id: string;
  userId: string;
  title: string;
  description: string;
  color: SubjectColor;
  targetDate?: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}
export interface Topic {
  id: string;
  subjectId: string;
  title: string;
  description?: string;
  status: "notStarted" | "inProgress" | "completed";
  targetDate?: string;
  sortOrder: number;
  completedAt?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface Resource {
  id: string;
  userId: string;
  subjectId: string;
  topicId?: string;
  type: "file" | "link" | "video" | "note";
  title: string;
  url?: string;
  storageKey?: string;
  textContent?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
}
export interface StudySession {
  id: string;
  userId: string;
  subjectId: string;
  topicId?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  status: "valid" | "discarded";
  note?: string;
  source: "timer" | "manual";
  createdAt: string;
}
export interface ActiveTimer {
  focusGoal?: string;
  subjectId: string;
  topicId?: string;
  startedAt: string;
  pausedAt?: string;
  pausedTotalSeconds: number;
  confirmedUntilSeconds: number;
}
export interface ScheduleException {
  overrides?: { subjectId?: string | null; topicId?: string | null; note?: string | null };
  date: string;
  cancelled: boolean;
  startsAt?: string;
  endsAt?: string;
  title?: string;
  subjectId?: string;
  topicId?: string;
  note?: string;
  color?: SubjectColor;
}
export interface ScheduleBlock {
  id: string;
  userId: string;
  subjectId?: string;
  topicId?: string;
  title: string;
  startsAt: string;
  endsAt: string;
  repeat: "once" | "weekly";
  weekdays: number[];
  recurrenceUntil?: string;
  timezone: string;
  note?: string;
  color: SubjectColor;
  exceptions: ScheduleException[];
  createdAt: string;
  updatedAt: string;
}
export interface Notification {
  id: string;
  userId: string;
  type: "block" | "subjectDeadline" | "topicDeadline";
  title: string;
  body: string;
  scheduledFor: string;
  readAt?: string;
  createdAt: string;
}
export interface AuditLog {
  id: string;
  actorUserId: string;
  action: "deactivate" | "reactivate" | "settingsChanged";
  targetType: "user" | "settings";
  targetId: string;
  createdAt: string;
}
export interface AppSettings {
  minimumAge?: number;
  streakMinutes: number;
  maxFileSizeMB: number;
  storagePerUserMB: number;
}
export interface Workspace {
  loadedAt?: string;
  shellOnly?: boolean;
  shellPending?: boolean;
  /** Fields populated by a focused page read; other fields belong to the shell or another page. */
  pageFields?: ("user" | "subjects" | "topics" | "resources" | "sessions" | "blocks" | "analytics" | "subjectStatistics" | "storageBytes" | "resourceCounts" | "timer" | "settings")[];
  resourceCounts?: Record<string, number>;
  storageBytes?: number;
  scope?: string;
  adminLearnerAnalytics?: import("@/lib/analytics/server").AnalyticsSummary;
  analytics?: import("@/lib/analytics/server").AnalyticsSummary;
  subjectStatistics?: Record<string, import("@/lib/services/subject-statistics").SubjectStatistics>;
  platform?: import("@/lib/analytics/platform").PlatformSummary;
  user: User;
  users: User[];
  subjects: Subject[];
  topics: Topic[];
  resources: Resource[];
  sessions: StudySession[];
  blocks: ScheduleBlock[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  settings: AppSettings;
  timer: ActiveTimer | null;
}
/** Admin-facing records deliberately exclude notes and resources. */
export interface LearnerStatistics {
  user: User;
  subjects: Pick<Subject, "id" | "title" | "color" | "status">[];
  progress: Record<string, number>;
  sessions: Omit<StudySession, "note">[];
}
