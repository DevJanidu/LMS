import { localDay, subjectProgress } from "@/lib/analytics";
import type { LearnerStatistics, Workspace } from "@/types";
/** Pure selectors over an authenticated, server-projected workspace. */
export function getSubjects(data: Workspace, userId = data.user.id) { return data.subjects.filter(row => row.userId === userId); }
export function getTopics(data: Workspace, subjectId?: string) {
  const ids = new Set(getSubjects(data).map(row => row.id));
  return data.topics.filter(row => !row.archived && ids.has(row.subjectId) && (!subjectId || row.subjectId === subjectId)).sort((a, b) => a.sortOrder - b.sortOrder);
}
export function getSessions(data: Workspace, userId = data.user.id) { return data.sessions.filter(row => row.userId === userId).sort((a, b) => b.startedAt.localeCompare(a.startedAt)); }
export function getTodaySessions(data: Workspace, now: number) { return getSessions(data).filter(row => localDay(row.startedAt, data.user.timezone) === localDay(now, data.user.timezone)); }
export function getResources(data: Workspace) { return data.resources.filter(row => row.userId === data.user.id); }
export function getLearnerStatistics(data: Workspace, userId: string): LearnerStatistics | undefined {
  const user = data.users.find(row => row.id === userId);
  if (!user) return;
  const subjects = getSubjects(data, userId).map(({ id, title, color, status }) => ({ id, title, color, status }));
  const progress = Object.fromEntries(subjects.map(subject => [subject.id, data.subjectStatistics?.[subject.id]?.progress ?? subjectProgress(data.topics.filter(topic => topic.subjectId === subject.id))]));
  const sessions = getSessions(data, userId).map(({ id, userId, subjectId, topicId, startedAt, endedAt, durationSeconds, status, source, createdAt }) => ({ id, userId, subjectId, topicId, startedAt, endedAt, durationSeconds, status, source, createdAt }));
  return { user, subjects, progress, sessions };
}
