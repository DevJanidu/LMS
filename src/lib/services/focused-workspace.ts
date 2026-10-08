import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { shellBaseWorkspace } from "./workspace";
import type { Subject, Topic, Workspace, SubjectColor } from "@/types";
import type { SubjectStatistics } from "./subject-statistics";
import { timed } from "@/lib/perf";
import { localDay, shiftDay, weekStart } from "@/lib/analytics";
import { getScheduleBlocksInRange } from "./lists";
import type { AnalyticsSummary } from "@/lib/analytics/server";

type Account = typeof schema.users.$inferSelect;
type PageField = NonNullable<Workspace["pageFields"]>[number];

function focused(account: Account, fields: PageField[], value: Partial<Workspace>): Workspace {
  return { ...shellBaseWorkspace(account), ...value, loadedAt: new Date().toISOString(), shellOnly: false, pageFields: fields };
}

type SubjectRow = {
  id: string; title: string; description: string; display_color: string;
  target_date: string | null; status: "active" | "archived";
  created_at: string; updated_at: string; topics: Array<{
    id: string; subjectId: string; title: string; description: string | null; status: "not_started" | "in_progress" | "completed";
    targetDate: string | null; sortOrder: number; completedAt: string | null; archived: boolean;
    createdAt: string; updatedAt: string;
  }>;
  completed: string; total: string; seconds: string; sessions: string; last_studied_at: string | null;
};

/** One database round trip for subject cards, topic choices and progress. */
export const subjectPageWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const result = await timed("page.subjects", () => getDb().execute<SubjectRow>(sql`
    SELECT s.id, s.title, s.description, s.display_color, s.target_date,
      s.status, s.created_at, s.updated_at,
      coalesce(t.items, '[]'::jsonb) AS topics,
      coalesce(t.completed, 0)::text AS completed,
      coalesce(t.total, 0)::text AS total,
      coalesce(ss.seconds, 0)::text AS seconds,
      coalesce(ss.sessions, 0)::text AS sessions,
      ss.last_studied_at
    FROM subjects s
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'description', t.description,
        'status', t.status, 'targetDate', t.target_date, 'sortOrder', t.sort_order,
        'completedAt', t.completed_at, 'archived', t.archived,
        'createdAt', t.created_at, 'updatedAt', t.updated_at
      ) ORDER BY t.sort_order) AS items,
      count(*) AS total,
      count(*) FILTER (WHERE t.status = 'completed') AS completed
      FROM topics t WHERE t.subject_id = s.id AND NOT t.archived
    ) t ON true
    LEFT JOIN LATERAL (
      SELECT sum(duration_seconds) AS seconds, count(*) AS sessions,
        max(started_at) AS last_studied_at
      FROM study_sessions WHERE user_id = ${account.id}::uuid AND subject_id = s.id
        AND status = 'valid' AND duration_seconds >= 60
    ) ss ON true
    WHERE s.user_id = ${account.id}::uuid
    ORDER BY s.created_at DESC
    LIMIT 10000
  `));
  const subjects: Subject[] = [], topics: Topic[] = [];
  const statistics: Record<string, SubjectStatistics> = {};
  for (const row of result.rows) {
    subjects.push({ id: row.id, userId: account.id, title: row.title, description: row.description,
      color: row.display_color as SubjectColor, targetDate: row.target_date ?? undefined,
      status: row.status, createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() });
    for (const topic of row.topics) topics.push({ id: topic.id, subjectId: row.id, title: topic.title,
      description: topic.description ?? undefined, status: topic.status === "not_started" ? "notStarted" : topic.status === "in_progress" ? "inProgress" : "completed",
      targetDate: topic.targetDate ?? undefined, sortOrder: topic.sortOrder,
      completedAt: topic.completedAt ? new Date(topic.completedAt).toISOString() : undefined,
      archived: topic.archived, createdAt: new Date(topic.createdAt).toISOString(), updatedAt: new Date(topic.updatedAt).toISOString() });
    const total = Number(row.total), completed = Number(row.completed);
    statistics[row.id] = { total, completed, seconds: Number(row.seconds), sessions: Number(row.sessions),
      progress: total ? Math.round(completed / total * 100) : 0,
      lastStudiedAt: row.last_studied_at ? new Date(row.last_studied_at).toISOString() : undefined };
  }
  return focused(account, ["subjects", "topics", "subjectStatistics"], { subjects, topics, subjectStatistics: statistics });
});

/** Study controls need only active subject and topic choices plus the current timer. */
export const studyPageWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const result = await timed("page.study", () => getDb().execute<{ subjects: Array<{
    id: string; title: string; description: string; displayColor: string; targetDate: string | null;
    status: "active" | "archived"; createdAt: string; updatedAt: string;
  }>; topics: SubjectRow["topics"]; timer: Array<{
    subjectId: string; topicId: string | null; startedAt: string; pausedAt: string | null;
    pausedTotalSeconds: number; confirmedUntilSeconds: number; focusGoal: string | null;
  }> }>(sql`
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title,
        'description', description, 'displayColor', display_color, 'targetDate', target_date,
        'status', status, 'createdAt', created_at, 'updatedAt', updated_at)), '[]'::jsonb)
        FROM subjects WHERE user_id = ${account.id}::uuid AND status = 'active') AS subjects,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'subjectId', t.subject_id, 'title', t.title,
        'description', t.description, 'status', t.status, 'targetDate', t.target_date,
        'sortOrder', t.sort_order, 'completedAt', t.completed_at, 'archived', t.archived,
        'createdAt', t.created_at, 'updatedAt', t.updated_at)), '[]'::jsonb)
        FROM topics t JOIN subjects s ON s.id = t.subject_id
        WHERE s.user_id = ${account.id}::uuid AND s.status = 'active' AND NOT t.archived) AS topics,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('subjectId', subject_id,
        'topicId', topic_id, 'startedAt', started_at, 'pausedAt', paused_at,
        'pausedTotalSeconds', paused_total_seconds, 'confirmedUntilSeconds', confirmed_until_seconds,
        'focusGoal', focus_goal)), '[]'::jsonb)
        FROM active_timers WHERE user_id = ${account.id}::uuid) AS timer
  `));
  const row = result.rows[0];
  const subjects: Subject[] = row.subjects.map(item => ({ id: item.id, userId: account.id, title: item.title,
    description: item.description, color: item.displayColor as SubjectColor, targetDate: item.targetDate ?? undefined,
    status: item.status, createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() }));
  // The compact study query does not need full topic descriptions or history.
  const topics: Topic[] = row.topics.map(item => ({ id: item.id, subjectId: item.subjectId,
    title: item.title, description: item.description ?? undefined,
    status: item.status === "not_started" ? "notStarted" : item.status === "in_progress" ? "inProgress" : "completed",
    targetDate: item.targetDate ?? undefined, sortOrder: item.sortOrder, archived: item.archived,
    completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : undefined,
    createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() }));
  const timer = row.timer[0];
  return focused(account, ["subjects", "topics", "timer"], { subjects, topics,
    timer: timer ? { subjectId: timer.subjectId, topicId: timer.topicId ?? undefined,
      startedAt: new Date(timer.startedAt).toISOString(), pausedAt: timer.pausedAt ? new Date(timer.pausedAt).toISOString() : undefined,
      pausedTotalSeconds: timer.pausedTotalSeconds, confirmedUntilSeconds: timer.confirmedUntilSeconds,
      focusGoal: timer.focusGoal ?? undefined } : null });
});

/** Library filters and upload limits in one round trip; the paginated rows load separately. */
export const resourcePageWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const result = await timed("page.resources.options", () => getDb().execute<{
    subjects: Array<{ id: string; title: string; description: string; displayColor: string; targetDate: string | null;
      status: "active" | "archived"; createdAt: string; updatedAt: string }>;
    topics: SubjectRow["topics"];
    storage_bytes: string;
    settings: Record<string, number>;
  }>(sql`
    SELECT
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title,
        'description', description, 'displayColor', display_color, 'targetDate', target_date,
        'status', status, 'createdAt', created_at, 'updatedAt', updated_at)), '[]'::jsonb)
        FROM subjects WHERE user_id = ${account.id}::uuid) AS subjects,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'subjectId', t.subject_id,
        'title', t.title, 'description', t.description, 'status', t.status,
        'targetDate', t.target_date, 'sortOrder', t.sort_order, 'completedAt', t.completed_at,
        'archived', t.archived, 'createdAt', t.created_at, 'updatedAt', t.updated_at)), '[]'::jsonb)
        FROM topics t JOIN subjects s ON s.id = t.subject_id
        WHERE s.user_id = ${account.id}::uuid AND NOT t.archived) AS topics,
      (SELECT coalesce(sum(size_bytes), 0)::text FROM resources WHERE user_id = ${account.id}::uuid) AS storage_bytes,
      (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM app_settings) AS settings
  `));
  const row = result.rows[0];
  const subjects: Subject[] = row.subjects.map(item => ({ id: item.id, userId: account.id, title: item.title,
    description: item.description, color: item.displayColor as SubjectColor, targetDate: item.targetDate ?? undefined,
    status: item.status, createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() }));
  const topics: Topic[] = row.topics.map(item => ({ id: item.id, subjectId: item.subjectId, title: item.title,
    description: item.description ?? undefined,
    status: item.status === "not_started" ? "notStarted" : item.status === "in_progress" ? "inProgress" : "completed",
    targetDate: item.targetDate ?? undefined, sortOrder: item.sortOrder, archived: item.archived,
    completedAt: item.completedAt ? new Date(item.completedAt).toISOString() : undefined,
    createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() }));
  return focused(account, ["subjects", "topics", "storageBytes", "settings"], {
    subjects, topics, storageBytes: Number(row.storage_bytes),
    settings: { streakMinutes: Number(row.settings.streakMinutes ?? 10),
      maxFileSizeMB: Number(row.settings.maxFileSizeMB ?? 10),
      storagePerUserMB: Number(row.settings.storagePerUserMB ?? 100),
      minimumAge: Number(row.settings.minimumAge ?? 0) },
  });
});

export const calendarPageWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const today = localDay(Date.now(), account.timezone);
  const from = weekStart(today, 1);
  const range = { from, to: shiftDay(from, 7) };
  const [choices, blocks] = await timed("page.calendar", () => Promise.all([
    studyPageWorkspace(account), getScheduleBlocksInRange(account.id, range),
  ]));
  return focused(account, ["subjects", "topics", "blocks", "timer"], {
    subjects: choices.subjects, topics: choices.topics, blocks, timer: choices.timer,
  });
});

/** The analytics page reads daily aggregates and subject progress, never session rows. */
export const analyticsPageWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const timezone = account.timezone;
  const today = localDay(Date.now(), timezone);
  const startMonth = `${today.slice(0, 7)}-01`;
  const result = await timed("page.analytics", () => getDb().execute<{
    days: Array<{ day: string; subjectId: string; seconds: string }>;
    session_count: string; topics_completed: string;
    subjects: Array<{ id: string; title: string; displayColor: string; targetDate: string | null;
      status: "active" | "archived"; createdAt: string; updatedAt: string;
      completed: number; total: number; lastStudiedAt: string | null }>;
    preferences: { weeklyTargetMinutes: number; weekStartDay: number; highestStreak: number; theme: "light" | "dark" | "auto"; reminders: boolean };
    settings: Record<string, number>;
  }>(sql`
    WITH owned AS (
      SELECT subject_id, started_at, ended_at, duration_seconds
      FROM study_sessions WHERE user_id = ${account.id}::uuid
        AND status = 'valid' AND duration_seconds >= 60
    ), fragments AS (
      SELECT subject_id, d::date::text AS day,
        duration_seconds * EXTRACT(EPOCH FROM (
          LEAST(ended_at, (d + INTERVAL '1 day') AT TIME ZONE ${timezone})
          - GREATEST(started_at, d AT TIME ZONE ${timezone})
        )) / NULLIF(EXTRACT(EPOCH FROM (ended_at - started_at)), 0) AS seconds
      FROM owned CROSS JOIN LATERAL generate_series(
        date_trunc('day', started_at AT TIME ZONE ${timezone}),
        date_trunc('day', ended_at AT TIME ZONE ${timezone}), INTERVAL '1 day'
      ) AS d
    ), daily AS (
      SELECT day, subject_id, SUM(GREATEST(seconds, 0))::text AS seconds
      FROM fragments GROUP BY day, subject_id
    ) SELECT
      coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'subjectId', subject_id,
        'seconds', seconds) ORDER BY day) FROM daily), '[]'::jsonb) AS days,
      (SELECT count(*)::text FROM owned) AS session_count,
      (SELECT count(*)::text FROM topics t JOIN subjects s ON s.id = t.subject_id
        WHERE s.user_id = ${account.id}::uuid AND NOT t.archived
          AND (t.completed_at AT TIME ZONE ${timezone})::date >= ${startMonth}::date
          AND (t.completed_at AT TIME ZONE ${timezone})::date <= ${today}::date) AS topics_completed,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title,
        'displayColor', s.display_color, 'targetDate', s.target_date, 'status', s.status,
        'createdAt', s.created_at, 'updatedAt', s.updated_at,
        'completed', coalesce(t.completed, 0), 'total', coalesce(t.total, 0),
        'lastStudiedAt', ss.last_studied_at)), '[]'::jsonb)
       FROM subjects s
       LEFT JOIN LATERAL (SELECT count(*) AS total,
         count(*) FILTER (WHERE status = 'completed') AS completed
         FROM topics WHERE subject_id = s.id AND NOT archived) t ON true
       LEFT JOIN LATERAL (SELECT max(started_at) AS last_studied_at
         FROM study_sessions WHERE user_id = ${account.id}::uuid AND subject_id = s.id
           AND status = 'valid' AND duration_seconds >= 60) ss ON true
       WHERE s.user_id = ${account.id}::uuid) AS subjects,
      (SELECT coalesce(jsonb_build_object('weeklyTargetMinutes', weekly_target_minutes,
        'weekStartDay', week_start_day, 'highestStreak', highest_streak,
        'theme', theme, 'reminders', reminders), '{}'::jsonb)
        FROM user_preferences WHERE user_id = ${account.id}::uuid) AS preferences,
      (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM app_settings) AS settings
  `));
  const row = result.rows[0];
  const preferences = row.preferences ?? { weeklyTargetMinutes: 0, weekStartDay: 1, highestStreak: 0, theme: "auto", reminders: true };
  const firstDay = preferences.weekStartDay === 0 ? 0 : 1;
  const thresholdMinutes = Number(row.settings.streakMinutes ?? 10);
  const startWeek = weekStart(today, firstDay);
  const daily: Record<string, number> = {}, subjectSeconds: AnalyticsSummary["subjectSeconds"] = {};
  let todaySeconds = 0, weekSeconds = 0, monthSeconds = 0, totalSeconds = 0;
  for (const item of row.days) {
    const seconds = Number(item.seconds);
    daily[item.day] = (daily[item.day] ?? 0) + seconds;
    const subject = subjectSeconds[item.subjectId] ??= { week: 0, month: 0, allTime: 0 };
    totalSeconds += seconds; subject.allTime += seconds;
    if (item.day === today) todaySeconds += seconds;
    if (item.day >= startWeek && item.day <= today) { weekSeconds += seconds; subject.week += seconds; }
    if (item.day >= startMonth && item.day <= today) { monthSeconds += seconds; subject.month += seconds; }
  }
  const valid = Object.keys(daily).filter(day => day <= today && daily[day] >= thresholdMinutes * 60).sort();
  let longestStreak = preferences.highestStreak ?? 0, run = 0, previous = "";
  for (const day of valid) { run = previous && shiftDay(previous, 1) === day ? run + 1 : 1; longestStreak = Math.max(longestStreak, run); previous = day; }
  let cursor = (daily[today] ?? 0) >= thresholdMinutes * 60 ? today : shiftDay(today, -1), currentStreak = 0;
  while ((daily[cursor] ?? 0) >= thresholdMinutes * 60) { currentStreak++; cursor = shiftDay(cursor, -1); }
  // Only current chart/heatmap days cross the server boundary. Full history is
  // used above for streaks and lifetime totals, then discarded.
  const visibleFrom = startMonth < shiftDay(today, -6) ? startMonth : shiftDay(today, -6);
  const visibleDaily = Object.fromEntries(Object.entries(daily).filter(([day]) => day >= visibleFrom && day <= today));
  const analytics: AnalyticsSummary = { sessionCount: Number(row.session_count), subjectDaily: {}, daily: visibleDaily,
    todaySeconds, weekSeconds, monthSeconds, totalSeconds, currentStreak, longestStreak,
    topicsCompletedThisMonth: Number(row.topics_completed), subjectSeconds };
  const subjects: Subject[] = row.subjects.map(item => ({ id: item.id, userId: account.id,
    title: item.title, description: "", color: item.displayColor as SubjectColor,
    targetDate: item.targetDate ?? undefined, status: item.status,
    createdAt: new Date(item.createdAt).toISOString(), updatedAt: new Date(item.updatedAt).toISOString() }));
  const statistics: Record<string, SubjectStatistics> = Object.fromEntries(row.subjects.map(item => [item.id, {
    total: Number(item.total), completed: Number(item.completed), seconds: 0, sessions: 0,
    progress: item.total ? Math.round(item.completed / item.total * 100) : 0,
    lastStudiedAt: item.lastStudiedAt ? new Date(item.lastStudiedAt).toISOString() : undefined,
  }]));
  const base = focused(account, ["user", "subjects", "analytics", "subjectStatistics", "settings"], {
    subjects, analytics, subjectStatistics: statistics,
    settings: { streakMinutes: thresholdMinutes, maxFileSizeMB: Number(row.settings.maxFileSizeMB ?? 10),
      storagePerUserMB: Number(row.settings.storagePerUserMB ?? 100), minimumAge: Number(row.settings.minimumAge ?? 0) },
  });
  base.user.weekStartDay = firstDay;
  base.user.weeklyTargetMinutes = Number(preferences.weeklyTargetMinutes ?? 0);
  base.user.longestStreak = Number(preferences.highestStreak ?? 0);
  base.user.theme = preferences.theme;
  base.user.reminders = preferences.reminders;
  return base;
});

/** One aggregate read drives the greeting metrics without loading subject cards or history rows. */
export const dashboardStatsWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const timezone = account.timezone;
  const today = localDay(Date.now(), timezone);
  const startMonth = `${today.slice(0, 7)}-01`;
  const result = await timed("page.dashboard.stats", () => getDb().execute<{
    days: Array<{ day: string; seconds: string }>;
    topics_completed: string;
    preferences: { weeklyTargetMinutes: number; weekStartDay: number; highestStreak: number; theme: "light" | "dark" | "auto"; reminders: boolean } | null;
    settings: Record<string, number>;
  }>(sql`
    WITH owned AS (
      SELECT started_at, ended_at, duration_seconds
      FROM study_sessions WHERE user_id = ${account.id}::uuid
        AND status = 'valid' AND duration_seconds >= 60
    ), fragments AS (
      SELECT d::date::text AS day,
        duration_seconds * EXTRACT(EPOCH FROM (
          LEAST(ended_at, (d + INTERVAL '1 day') AT TIME ZONE ${timezone})
          - GREATEST(started_at, d AT TIME ZONE ${timezone})
        )) / NULLIF(EXTRACT(EPOCH FROM (ended_at - started_at)), 0) AS seconds
      FROM owned CROSS JOIN LATERAL generate_series(
        date_trunc('day', started_at AT TIME ZONE ${timezone}),
        date_trunc('day', ended_at AT TIME ZONE ${timezone}), INTERVAL '1 day'
      ) AS d
    ), daily AS (SELECT day, sum(greatest(seconds, 0))::text AS seconds
      FROM fragments GROUP BY day)
    SELECT
      coalesce((SELECT jsonb_agg(jsonb_build_object('day', day, 'seconds', seconds))
        FROM daily), '[]'::jsonb) AS days,
      (SELECT count(*)::text FROM topics t JOIN subjects s ON s.id = t.subject_id
        WHERE s.user_id = ${account.id}::uuid AND NOT t.archived
          AND (t.completed_at AT TIME ZONE ${timezone})::date >= ${startMonth}::date
          AND (t.completed_at AT TIME ZONE ${timezone})::date <= ${today}::date) AS topics_completed,
      (SELECT jsonb_build_object('weeklyTargetMinutes', weekly_target_minutes,
        'weekStartDay', week_start_day, 'highestStreak', highest_streak,
        'theme', theme, 'reminders', reminders)
        FROM user_preferences WHERE user_id = ${account.id}::uuid) AS preferences,
      (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM app_settings) AS settings
  `));
  const row = result.rows[0];
  const prefs = row.preferences ?? { weeklyTargetMinutes: 0, weekStartDay: 1, highestStreak: 0, theme: "auto", reminders: true };
  const firstDay = prefs.weekStartDay === 0 ? 0 : 1;
  const thresholdMinutes = Number(row.settings.streakMinutes ?? 10);
  const startWeek = weekStart(today, firstDay);
  const daily: Record<string, number> = {};
  for (const item of row.days) daily[item.day] = Number(item.seconds);
  const valid = Object.keys(daily).filter(day => day <= today && daily[day] >= thresholdMinutes * 60).sort();
  let longestStreak = Number(prefs.highestStreak ?? 0), run = 0, previous = "";
  for (const day of valid) { run = previous && shiftDay(previous, 1) === day ? run + 1 : 1; longestStreak = Math.max(longestStreak, run); previous = day; }
  let cursor = (daily[today] ?? 0) >= thresholdMinutes * 60 ? today : shiftDay(today, -1), currentStreak = 0;
  while ((daily[cursor] ?? 0) >= thresholdMinutes * 60) { currentStreak++; cursor = shiftDay(cursor, -1); }
  const weekSeconds = Object.entries(daily).reduce((sum, [day, seconds]) => sum + (day >= startWeek && day <= today ? seconds : 0), 0);
  const visibleDaily = Object.fromEntries(Object.entries(daily).filter(([day]) => day >= startWeek && day <= today));
  const analytics: AnalyticsSummary = { sessionCount: 0, daily: visibleDaily, subjectDaily: {}, subjectSeconds: {},
    todaySeconds: daily[today] ?? 0, weekSeconds, monthSeconds: 0, totalSeconds: 0,
    currentStreak, longestStreak, topicsCompletedThisMonth: Number(row.topics_completed) };
  const workspace = focused(account, ["user", "analytics", "settings"], { analytics,
    settings: { streakMinutes: thresholdMinutes, maxFileSizeMB: Number(row.settings.maxFileSizeMB ?? 10),
      storagePerUserMB: Number(row.settings.storagePerUserMB ?? 100), minimumAge: Number(row.settings.minimumAge ?? 0) } });
  workspace.user.weekStartDay = firstDay;
  workspace.user.weeklyTargetMinutes = Number(prefs.weeklyTargetMinutes ?? 0);
  workspace.user.longestStreak = Number(prefs.highestStreak ?? 0);
  workspace.user.theme = prefs.theme;
  workspace.user.reminders = prefs.reminders;
  return workspace;
});

/** Cards, the near-term schedule and four recent activities load alongside the metric section. */
export const dashboardScheduleBlocks = cache(async (account: Account) => {
  const today = localDay(Date.now(), account.timezone);
  return getScheduleBlocksInRange(account.id, { from: shiftDay(today, -1), to: shiftDay(today, 7) });
});

export const dashboardBodyWorkspace = cache(async (account: Account): Promise<Workspace> => {
  const [subjectData, blocks, recent] = await timed("page.dashboard.body", () => Promise.all([
    subjectPageWorkspace(account),
    dashboardScheduleBlocks(account),
    getDb().execute<{ id: string; subject_id: string; topic_id: string | null;
      started_at: string; ended_at: string; duration_seconds: number; status: "valid" | "discarded";
      source: "timer" | "manual"; created_at: string }>(sql`
      SELECT id, subject_id, topic_id, started_at, ended_at,
        duration_seconds, status, source, created_at
      FROM study_sessions WHERE user_id = ${account.id}::uuid
      ORDER BY started_at DESC LIMIT 4
    `),
  ]));
  return focused(account, ["subjects", "topics", "subjectStatistics", "blocks", "sessions"], {
    subjects: subjectData.subjects, topics: subjectData.topics,
    subjectStatistics: subjectData.subjectStatistics, blocks,
    sessions: recent.rows.map(row => ({ id: row.id, userId: account.id, subjectId: row.subject_id,
      topicId: row.topic_id ?? undefined, startedAt: new Date(row.started_at).toISOString(),
      endedAt: new Date(row.ended_at).toISOString(), durationSeconds: row.duration_seconds,
      status: row.status, source: row.source, createdAt: new Date(row.created_at).toISOString() })),
  });
});
