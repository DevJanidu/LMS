import {
  parseCommand,
  type AvenWorkflow,
  type MentionType,
} from "./commands";
import { classifyIntent, type AvenIntent, type IntentResult } from "./intent";
/**
 * Turn planning: one routing path for slash commands, mentions and plain language.
 * A command only fixes the workflow the same words would usually reach; it never
 * unlocks tools. With no recognizable workflow, every tool stays available.
 */
const CORE = ["getUserProfile", "getSubjects", "getUserGoals", "getCalendar"];
export const workflowTools: Record<Exclude<AvenWorkflow, "general" | "help">, string[]> = {
  plan: [
    "proposeGoalHierarchy", "proposeGoal", "proposeGoalPlan", "getGoalDetails", "getTopics",
    "createGoalMilestone", "createGoalTask", "getNextBestAction", "getUpcomingDeadlines",
    "proposeStudySchedule", "scheduleStudySessions", "getGoalHealth",
  ],
  schedule: [
    "createStudySchedule", "proposeStudySchedule", "proposePracticeSessions", "moveStudySessions",
    "cancelStudySessions", "rescheduleStudySession", "getStudySchedule", "getGoalDetails",
    "getTopics", "auditTopicCoverage", "scheduleStudySessions", "createReminder", "listReminders",
    "cancelReminders",
  ],
  catchup: [
    "getLearningGaps", "getGoalHealth", "getGoalDetails", "proposeStudySchedule",
    "proposePracticeSessions", "getStudySchedule", "getNextBestAction", "moveStudySessions",
    "auditTopicCoverage", "scheduleStudySessions", "manageGoal",
  ],
  review: [
    "getGoalHealth", "getLearningGaps", "getWeeklyAnalytics", "getStudyHistory", "getGoalProgress",
    "getGoalDetails", "auditTopicCoverage", "getNextBestAction",
  ],
  practice: [
    "auditTopicCoverage", "proposePracticeSessions", "recordLearningSignal", "getTopics",
    "getStudyHistory", "getStudyResources", "getGoalHealth",
  ],
  goals: [
    "getGoalDetails", "getGoalProgress", "getGoalHealth", "getNextBestAction", "completeGoal",
    "createGoalMilestone", "createGoalTask", "updateGoalTask", "proposeGoal", "proposeGoalHierarchy",
    "manageGoal",
  ],
  subjects: [
    "getTopics", "auditTopicCoverage", "getStudyResources", "organizeLearningResource",
    "recordLearningSignal", "manageSubjects", "manageTopics", "manageLibrary",
  ],
  progress: [
    "getWeeklyAnalytics", "getStudyHistory", "getGoalProgress", "getGoalHealth", "getStudyCircles",
    "auditTopicCoverage",
  ],
  friends: ["getStudyCircles"],
};
const intentWorkflow: Partial<Record<AvenIntent, AvenWorkflow | AvenWorkflow[]>> = {
  goal: "plan",
  schedule: "schedule",
  reschedule: "schedule",
  progress: "progress",
  nextAction: "review",
  recovery: "catchup",
  struggle: "practice",
  social: "friends",
  manage: ["subjects", "goals"],
};
/** Reading tools that a mentioned record type needs, regardless of workflow. */
const mentionTools: Record<MentionType, string[]> = {
  subject: ["getTopics", "auditTopicCoverage"],
  topic: ["getTopics", "auditTopicCoverage"],
  goal: ["getGoalDetails", "getGoalHealth"],
  milestone: ["getGoalDetails"],
  task: ["getGoalDetails"],
  session: ["getStudySchedule"],
  resource: ["getStudyResources"],
  friend: ["getStudyCircles"],
  circle: ["getStudyCircles"],
};
const SPECIFICITY: AvenWorkflow[] = [
  "catchup", "practice", "schedule", "review", "progress", "friends", "plan", "goals", "subjects",
];
const PLANNING: AvenWorkflow[] =["plan", "schedule", "catchup", "practice"];
const commandGuidance: Partial<Record<AvenWorkflow, string>> = {
  plan: "Command /plan: build a learning or goal plan. Check getUserGoals for duplicates, then propose a goal hierarchy (or extend the mentioned goal).",
  schedule: "Command /schedule: schedule study sessions from real availability. Use reasonable defaults for unspecified dates or durations; never overlap commitments.",
  catchup: "Command /catchup: recover overdue work. Read getLearningGaps and getGoalHealth, then propose a realistic catch-up schedule within the daily target.",
  review: "Command /review: analyze study and goal progress from records (getGoalHealth, getLearningGaps, getWeeklyAnalytics) and recommend the next step.",
  practice: "Command /practice: focused practice. Audit the subject's coverage, then propose practice sessions for the weakest open topics.",
  goals: "Command /goals: review and manage goals. Summarize health and next actions; changes are proposals only.",
  subjects: "Command /subjects: review subjects and topics with auditTopicCoverage; organize resources only through proposals.",
  progress: "Command /progress: summarize recent verified learning activity and compare with last week only when both weeks have records.",
  friends: "Command /friends: summarize permitted Study Circles activity using getStudyCircles only.",
  help: "Command /help: briefly list the slash commands (/plan, /schedule, /catchup, /review, /practice, /goals, /subjects, /progress, /friends, /help) and explain that @ mentions point to subjects, topics, goals, milestones, tasks, sessions, resources, friends and study groups. Mention that plain language works too.",
};
export interface TurnPlan {
  command: string | null;
  workflows: AvenWorkflow[];
  intent: IntentResult;
  planning: boolean;
  /** null means every tool (no workflow recognized). */
  tools: string[] | null;
  guidance: string;
}
export function planTurn(message: string, mentions: MentionType[] = []): TurnPlan {
  const { command, rest } = parseCommand(message);
  const intent = classifyIntent(rest || message);
  const workflows = [
    ...new Set<AvenWorkflow>([
      ...(command && command.workflow !== "help" ? [command.workflow] : []),
      // More specific needs lead: "falling behind on my goal" is catch-up before planning.
      ...intent.intents
        .flatMap((item) => intentWorkflow[item] ?? [])
        .flat()
        .sort((a, b) => SPECIFICITY.indexOf(a) - SPECIFICITY.indexOf(b)),
    ]),
  ];
  // A bare /help needs no records at all.
  const helpOnly = command?.workflow === "help" && !rest && !mentions.length;
  // Learning requests, reminders and anything unrecognized keep the full toolset.
  const general =
    !helpOnly && (!workflows.length || intent.intents.includes("learn") || intent.multiPart);
  const tools = helpOnly
    ? ["getUserProfile"]
    : general
    ? null
    : [
        ...new Set([
          ...CORE,
          ...workflows.flatMap((item) => workflowTools[item as keyof typeof workflowTools] ?? []),
          ...mentions.flatMap((type) => mentionTools[type]),
        ]),
      ];
  return {
    command: command?.name ?? null,
    workflows: general ? [...workflows, "general"] : workflows,
    intent,
    planning: intent.planning || workflows.some((item) => PLANNING.includes(item)),
    tools,
    guidance:
      command && commandGuidance[command.workflow]
        ? `\n${commandGuidance[command.workflow]}`
        : "",
  };
}
