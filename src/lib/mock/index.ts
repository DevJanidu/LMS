import { createSeed } from "./seed";
import { localDay, subjectProgress } from "@/lib/analytics";
import type { LearnerStatistics, Workspace } from "@/types";

/** Replace these query-shaped functions with server queries when adding a backend. */
export function getWorkspace(): Workspace { return createSeed(); }
export function getSubjects(data: Workspace, userId = data.user.id) { return data.subjects.filter((item) => item.userId === userId); }
export function getTopics(data: Workspace, subjectId?: string) { const ids = new Set(getSubjects(data).map((subject) => subject.id)); return data.topics.filter((topic) => ids.has(topic.subjectId) && (!subjectId || topic.subjectId === subjectId)).sort((a, b) => a.sortOrder - b.sortOrder); }
export function getSessions(data: Workspace, userId = data.user.id) { return data.sessions.filter((item) => item.userId === userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
export function getTodaySessions(data: Workspace, now: number) { return getSessions(data).filter((item) => localDay(item.startedAt, data.user.timezone) === localDay(now, data.user.timezone)); }
export function getResources(data: Workspace) { return data.resources.filter((item) => item.userId === data.user.id); }
export function getLearnerStatistics(data: Workspace, userId: string): LearnerStatistics | undefined {
  const user = data.users.find((item) => item.id === userId);
  if (!user) return undefined;
  const subjects = getSubjects(data, userId).map(({ id, title, color, status }) => ({ id, title, color, status }));
  const progress = Object.fromEntries(subjects.map((subject) => [subject.id, subjectProgress(data.topics.filter((topic) => topic.subjectId === subject.id))]));
  const sessions = getSessions(data, userId).map(({ id, userId: owner, subjectId, topicId, startedAt, endedAt, durationSeconds, status, source, createdAt }) => ({ id, userId: owner, subjectId, topicId, startedAt, endedAt, durationSeconds, status, source, createdAt }));
  return { user, subjects, progress, sessions };
}
