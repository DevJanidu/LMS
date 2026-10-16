/** Deterministic intent hints. They steer tool choice and model selection; the model still decides. */
export type AvenIntent =
  | "goal"
  | "schedule"
  | "reschedule"
  | "progress"
  | "nextAction"
  | "recovery"
  | "struggle"
  | "learn";
export interface IntentResult {
  intents: AvenIntent[];
  /** Several outcomes, ordered steps or list items in one message. */
  multiPart: boolean;
  /** Goal decomposition and schedule construction use the planning model. */
  planning: boolean;
}
const patterns: [AvenIntent, RegExp][] = [
  [
    "goal",
    /\b(goals?|i want to (become|get|land|find|pass|learn|master|build|finish|complete)|i('d| would) like to (become|get|land|learn)|aim to|within (a|one|two|three|four|six|\d+) (weeks?|months?|years?)|by (the end of|next) |job|career|certification|exam)\b/i,
  ],
  [
    "schedule",
    /\b(every (day|morning|evening|night|weekday|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|daily|each (day|week)|(add|schedule|block|book|plan) .{0,40}\b(session|study|from \d|at \d|\d ?(am|pm))|study schedule|timetable)\b/i,
  ],
  [
    "reschedule",
    /\b(move|reschedule|shift|push|postpone|bring forward|cancel|skip|delete) .{0,40}\b(session|class|study|block|today|tomorrow|tonight|to \d|until)\b/i,
  ],
  [
    "progress",
    /\b(progress|how am i doing|on track|review (my )?goals?|where do i stand|status of)\b/i,
  ],
  [
    "nextAction",
    /\b(what should i (do|study|work on|focus on)|next (step|task|action)|where (do|should) i start|prioriti[sz]e|plan my day)\b/i,
  ],
  [
    "recovery",
    /\b(fall(ing|en)? behind|behind (on|schedule)|catch[- ]up|recovery plan|get back on track|missed (my|a|the|several|some) (sessions?|classes|tasks?|deadlines?))\b/i,
  ],
  [
    "struggle",
    /\b(i('m| am) (really |so |pretty )?(bad|terrible|weak|awful|struggling|stuck|lost|confused) (at|with|in|on)|struggl(e|ing) with|(don't|do not|can't|cannot) (understand|get|grasp)|need (more|extra) (practice|sessions?|time)|wish i had more time|keep (skipping|avoiding|postponing|putting off)|(not sure|unsure) (if |whether )?i('m| am) (making|getting) (any )?progress|making (no|little) progress)\b/i,
  ],
  [
    "learn",
    /\b(explain|teach me|help me (learn|understand)|what is|how does|quiz me)\b/i,
  ],
];
export function classifyIntent(message: string): IntentResult {
  const text = message.slice(0, 2000);
  const intents = patterns
    .filter(([, pattern]) => pattern.test(text))
    .map(([intent]) => intent);
  const steps = (text.match(/\b(first|then|after that|next|finally)\b/gi) ?? [])
    .length;
  const items = text.split(/,|;|\band\b/i).filter((part) => part.trim()).length;
  const multiPart = steps >= 2 || (intents.includes("goal") && items >= 4);
  return {
    intents,
    multiPart,
    // Reading progress on an existing goal does not need the planning model.
    planning:
      multiPart ||
      intents.includes("schedule") ||
      intents.includes("recovery") ||
      intents.includes("struggle") ||
      (intents.includes("goal") && !intents.includes("progress")),
  };
}
const guidance: Record<AvenIntent, string> = {
  goal: "Goal-setting intent detected. Call getUserGoals (search by key words) to check for duplicates before proposing. For an outcome with several stages, deadlines or skills, call proposeGoalHierarchy with ordered milestones, dependencies and concrete tasks instead of one simple goal. Ask at most one essential question only if the outcome or deadline is missing. After the proposal, ask whether to save it.",
  schedule:
    "Scheduling intent detected. Resolve the subject (subjectName or getSubjects), the exact local date range from the verified local date, and recurrence (repeat=daily for every day). Call createStudySchedule; if it reports conflicts, describe them and ask whether to skip those dates (skipConflicts=true) or choose another time.",
  reschedule:
    "Schedule-change intent detected. Read getCalendar for the relevant dates first. Keep durations. For a recurring session use scope 'one' unless the student explicitly asked for future occurrences or the whole series; if it is unclear, ask which one before proposing. Never change a whole series silently.",
  progress:
    "Progress intent detected. Use getUserGoals or getGoalDetails for verified figures; do not estimate progress.",
  nextAction:
    "Next-action intent detected. Call getNextBestAction and explain its verified reasons briefly; you may add context but do not reorder its ranking.",
  recovery:
    "Recovery intent detected. Read incomplete work (getGoalDetails) and the calendar, check whether a catch-up draft already exists in this conversation, then use proposeStudySchedule for the goal. Keep the load within the daily target and stay encouraging without guilt.",
  struggle:
    "Difficulty or progress concern detected. Treat it as a signal about the plan, not small talk. 1) Resolve the subject and call auditTopicCoverage; call getGoalHealth or getLearningGaps when goals or deadlines are involved. 2) Explain what needs attention, why it matters and the recorded evidence (use tool counts verbatim; completed is not mastery; low study time does not prove poor understanding, and the student's report counts even when completion looks good). 3) If the student asked for more sessions, call proposePracticeSessions with explicitRequest=true; if they only expressed a feeling, offer it in one sentence instead of proposing. 4) Offer recordLearningSignal so future plans account for it; never label a subject weak permanently. Do not change the calendar without an approved proposal, and if there is no free time, present trade-offs instead of inventing time.",
  learn:
    "Learning intent detected. Teach directly; use permitted resources when available and cite only processed sources.",
};
export function intentGuidance(result: IntentResult) {
  const lines = result.intents.map((intent) => guidance[intent]);
  if (result.multiPart)
    lines.push(
      "The message contains several parts. Extract the main outcome, deadline, milestones, dependencies, suggested tasks, an optional schedule and your assumptions; address every part.",
    );
  return lines.length ? `\nTURN GUIDANCE:\n${lines.join("\n")}` : "";
}
