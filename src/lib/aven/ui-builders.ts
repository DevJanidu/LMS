import { goalCardsFromTool } from "./goal-cards";
import { nextActionsSchema, type GoalCard } from "./validation";
import {
  readyComponent,
  type ReadyUiComponent,
  type UiComponentType,
} from "./ui-components";
/** Which components a tool can produce, so a placeholder can appear while it runs. */
const producers: Record<string, UiComponentType[]> = {
  getUserGoals: ["goal_progress"],
  getGoalDetails: ["goal_progress", "task_list"],
  getNextBestAction: ["next_actions"],
  auditTopicCoverage: ["topic_coverage"],
  getWeeklyAnalytics: ["study_analytics"],
  getStudyHistory: ["study_analytics"],
  getStudyCircles: ["circle_leaderboard"],
};
export const componentTypesForTool = (name: string) => producers[name] ?? [];
const minutes = (hours: unknown) =>
  Math.max(0, Math.round((Number(hours) || 0) * 60));
const days = (period: { from?: string; to?: string } | undefined) =>
  period?.from && period.to
    ? Math.max(1, Math.round((Date.parse(period.to) - Date.parse(period.from)) / 864e5))
    : 7;
/**
 * Builds registry components from one verified tool result. Goal cards accumulate across
 * calls in a turn (the latest four), matching what the reply discusses. Anything that does
 * not validate is simply not shown; nothing is invented to fill a card.
 */
export function componentsFromTool(
  name: string,
  output: unknown,
  goals: Map<string, GoalCard>,
): ReadyUiComponent[] {
  if (!output || typeof output !== "object" || "error" in output) return [];
  const result: (ReadyUiComponent | null)[] = [];
  const cards = goalCardsFromTool(name, output);
  if (cards.length) {
    for (const card of cards) {
      goals.delete(card.id);
      goals.set(card.id, card);
    }
    result.push(
      readyComponent("goal_progress", { goals: [...goals.values()].slice(-4) }),
    );
  }
  if (name === "getNextBestAction") {
    const actions = nextActionsSchema.safeParse(
      (output as { actions?: unknown }).actions,
    );
    if (actions.success)
      result.push(readyComponent("next_actions", { actions: actions.data }));
  }
  if (name === "getGoalDetails") {
    const detail = output as {
      goal?: { id: string; title: string };
      tasks?: {
        id: string;
        title: string;
        status: string;
        priority?: string;
        dueDate?: string | null;
      }[];
    };
    const today = new Date().toISOString().slice(0, 10);
    const open = (detail.tasks ?? []).filter(
      (task) => task.status === "todo" || task.status === "inProgress",
    );
    if (detail.goal && open.length)
      result.push(
        readyComponent("task_list", {
          goalId: detail.goal.id,
          goalTitle: detail.goal.title.slice(0, 200),
          tasks: open.slice(0, 8).map((task) => ({
            id: task.id,
            title: task.title.slice(0, 200),
            status: task.status,
            priority: task.priority ?? "normal",
            dueDate: task.dueDate ?? null,
            overdue: Boolean(task.dueDate && task.dueDate < today),
          })),
          remaining: open.length,
        }),
      );
  }
  if (name === "auditTopicCoverage") {
    const audit = output as {
      subject?: { id: string; title: string };
      counts?: Record<string, number>;
      overdue?: { id: string; title: string; targetDate: string | null }[];
      topics?: { id: string; title: string; targetDate: string | null; completed: boolean }[];
    };
    if (audit.subject && audit.counts)
      result.push(
        readyComponent("topic_coverage", {
          subject: { id: audit.subject.id, title: audit.subject.title.slice(0, 200) },
          counts: {
            required: audit.counts.required,
            completed: audit.counts.completed,
            remaining: audit.counts.remaining,
            inProgress: audit.counts.inProgress,
            overdue: audit.counts.overdue,
          },
          overdue: (audit.overdue ?? []).slice(0, 5),
          nextTopics: (audit.topics ?? [])
            .filter((topic) => !topic.completed)
            .slice(0, 3)
            .map(({ id, title, targetDate }) => ({ id, title, targetDate })),
        }),
      );
  }
  if (name === "getWeeklyAnalytics" || name === "getStudyHistory") {
    const history = output as {
      period?: { from?: string; to?: string };
      summary?: { hours: number; count: number };
      previousWeek?: { hours: number; count: number; comparable: boolean };
    };
    if (history.summary)
      result.push(
        readyComponent("study_analytics", {
          periodDays: days(history.period),
          minutes: minutes(history.summary.hours),
          sessions: history.summary.count,
          // A comparison is only shown when the earlier week has records.
          previous: history.previousWeek?.comparable
            ? {
                minutes: minutes(history.previousWeek.hours),
                sessions: history.previousWeek.count,
              }
            : null,
        }),
      );
  }
  if (name === "getStudyCircles") {
    const circles = output as {
      weekEndsAt?: string;
      me?: {
        friendsRank: number | null;
        verifiedMinutesThisWeek: number;
        minutesBehindNextRank: number | null;
      };
      friendsLeaderboard?: { rank: number; name: string; verifiedMinutes: number }[];
    };
    const rows = circles.friendsLeaderboard ?? [];
    // A board of one is not a competition; the reply covers it in words.
    if (circles.weekEndsAt && circles.me && rows.length > 1)
      result.push(
        readyComponent("circle_leaderboard", {
          weekEndsAt: circles.weekEndsAt,
          me: {
            rank: circles.me.friendsRank,
            minutes: circles.me.verifiedMinutesThisWeek,
            minutesBehindNext: circles.me.minutesBehindNextRank,
          },
          rows: rows.slice(0, 10).map((row) => ({
            rank: row.rank,
            name: row.name.slice(0, 120),
            minutes: row.verifiedMinutes,
            me: row.name === "You",
          })),
        }),
      );
  }
  return result.filter((item): item is ReadyUiComponent => Boolean(item));
}
