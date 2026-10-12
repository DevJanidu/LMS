/**
 * Deterministic composition of proactive messages. Functions return translation keys and
 * values only; every value comes from a verified record passed in by the scheduler.
 */
export interface MessagePart {
  key: string;
  values?: Record<string, string | number>;
}
export interface SessionFact {
  title: string;
  startsAt: string;
  localTime: string;
}
export interface ActionFact {
  taskTitle: string;
  goalTitle: string;
  remainingMinutes: number;
}
export type CheckInTemplate =
  | "freeTime"
  | "deadlineSoon"
  | "progress"
  | "upcoming"
  | "nextStep";
export interface CheckInContext {
  now: number;
  recordedMinutesToday: number;
  /** Next planned session today that has not started. */
  upcoming?: SessionFact;
  nextAction?: ActionFact;
  /** Nearest open goal or task deadline within a week. */
  deadline?: { title: string; days: number };
  lastTemplate?: string;
}
/**
 * Pick a check-in with a concrete purpose. Returns null when nothing useful can be said:
 * Aven never sends a generic "engagement" message.
 */
export function chooseCheckIn(
  context: CheckInContext,
): { template: CheckInTemplate; part: MessagePart } | null {
  const options: { template: CheckInTemplate; part: MessagePart }[] = [];
  const until = context.upcoming
    ? Math.floor((Date.parse(context.upcoming.startsAt) - context.now) / 60000)
    : null;
  // Time before a planned session is described as a possibility, never as confirmed free time.
  if (
    context.upcoming &&
    context.nextAction &&
    until !== null &&
    until >= 30 &&
    until <= 180 &&
    context.nextAction.remainingMinutes > 0 &&
    context.nextAction.remainingMinutes <= until - 10
  )
    options.push({
      template: "freeTime",
      part: {
        key: "checkInFreeTime",
        values: {
          minutes: until,
          session: context.upcoming.title,
          task: context.nextAction.taskTitle,
          taskMinutes: context.nextAction.remainingMinutes,
        },
      },
    });
  if (context.deadline)
    options.push({
      template: "deadlineSoon",
      part: {
        key: "checkInDeadline",
        values: { title: context.deadline.title, days: context.deadline.days },
      },
    });
  if (context.recordedMinutesToday > 0)
    options.push({
      template: "progress",
      part: context.nextAction
        ? {
            key: "checkInProgress",
            values: {
              minutes: context.recordedMinutesToday,
              title: context.nextAction.goalTitle,
            },
          }
        : {
            key: "checkInProgressGeneral",
            values: { minutes: context.recordedMinutesToday },
          },
    });
  if (context.upcoming)
    options.push({
      template: "upcoming",
      part: {
        key: "checkInUpcoming",
        values: {
          title: context.upcoming.title,
          time: context.upcoming.localTime,
        },
      },
    });
  if (context.nextAction)
    options.push({
      template: "nextStep",
      part: {
        key: "checkInNextStep",
        values: { task: context.nextAction.taskTitle },
      },
    });
  // Vary the message: prefer the most useful option that was not used last time.
  return (
    options.find((option) => option.template !== context.lastTemplate) ??
    options[0] ??
    null
  );
}
export function morningBriefing(input: {
  sessions: SessionFact[];
  tasksDueThisWeek: number;
  tasksDueToday: number;
  nextAction?: ActionFact;
}): MessagePart[] {
  const parts: MessagePart[] = [];
  const [first] = input.sessions;
  if (first)
    parts.push({
      key:
        input.sessions.length > 1
          ? "briefingSessionsMany"
          : "briefingSessionsOne",
      values: {
        title: first.title,
        time: first.localTime,
        more: input.sessions.length - 1,
      },
    });
  else parts.push({ key: "briefingNoSessions" });
  if (input.tasksDueToday)
    parts.push({ key: "briefingDueToday", values: { count: input.tasksDueToday } });
  else if (input.tasksDueThisWeek)
    parts.push({
      key: "briefingDueWeek",
      values: { count: input.tasksDueThisWeek },
    });
  parts.push(
    input.nextAction
      ? { key: "briefingFocus", values: { task: input.nextAction.taskTitle } }
      : { key: "briefingFocusNone" },
  );
  return parts;
}
export interface WeekFacts {
  minutes: number;
  sessions: number;
}
export function weeklyReview(input: {
  thisWeek: WeekFacts;
  lastWeek: WeekFacts;
  completedTasks: number;
  missedSessions: number;
  activeGoals: number;
  deadlinesNextWeek: number;
  nextAction?: ActionFact;
}): MessagePart[] {
  const hours = (minutes: number) => Math.round(minutes / 6) / 10;
  const parts: MessagePart[] = [
    {
      key: "weeklyStudied",
      values: {
        hours: hours(input.thisWeek.minutes),
        sessions: input.thisWeek.sessions,
      },
    },
  ];
  // Only compare when last week has records; an empty week is not a baseline.
  if (input.lastWeek.sessions > 0) {
    const difference = input.thisWeek.sessions - input.lastWeek.sessions;
    parts.push({
      key:
        difference > 0
          ? "weeklyMoreSessions"
          : difference < 0
            ? "weeklyFewerSessions"
            : "weeklySameSessions",
      values: { count: Math.abs(difference) },
    });
  }
  parts.push({
    key: "weeklyTasks",
    values: { completed: input.completedTasks, goals: input.activeGoals },
  });
  if (input.missedSessions)
    parts.push({ key: "weeklyMissed", values: { count: input.missedSessions } });
  if (input.deadlinesNextWeek)
    parts.push({
      key: "weeklyDeadlines",
      values: { count: input.deadlinesNextWeek },
    });
  parts.push(
    input.nextAction
      ? { key: "weeklyRecommend", values: { task: input.nextAction.taskTitle } }
      : { key: "weeklyRecommendPlan" },
  );
  return parts;
}
