import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { GoalError } from "@/lib/goals/service";
import { localDay, shiftDay, wallTime } from "@/lib/analytics";
import { getAvenPreferences } from "./preferences";
import { storeProposal } from "./proposals";
import { planSubjectSessions, scheduleProposal } from "./study-planner";
import {
  checklistProgress,
  componentStateSchemas,
  plannerWindow,
  plannerWindows,
  quizSecretSchema,
  validChecklistState,
  validFlashcardState,
  type ChecklistData,
  type FlashcardsData,
  type QuizData,
  type StudyPlannerData,
} from "./ui-blocks";
import {
  SECRET_PREFIX,
  STATE_PREFIX,
  readyComponent,
  savedState,
  storedComponents,
  type ReadyUiComponent,
  type SavedState,
} from "./ui-components";
/**
 * Interaction state for interactive blocks, stored on the reply that showed them as
 * `ui:<componentId>` = {"v": n, "data": …}. Every operation re-checks ownership through the
 * conversation, validates the state against the block it belongs to, and writes with
 * compare-and-set on `v`, so two tabs cannot silently overwrite each other and a repeated
 * submission cannot apply twice. No interaction here calls the model.
 */
export const componentActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("state"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    componentId: z.string().max(80),
    base: z.number().int().min(0),
    state: z.unknown(),
  }),
  z.object({
    kind: z.literal("quizAnswer"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    componentId: z.string().max(80),
    questionId: z.string().max(40),
    choice: z.number().int().min(0).max(5),
  }),
  z.object({
    kind: z.literal("quizReset"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    componentId: z.string().max(80),
  }),
  z.object({
    kind: z.literal("saveChecklist"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    componentId: z.string().max(80),
    targetDate: z.iso.date(),
  }),
  z.object({
    kind: z.literal("replan"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    componentId: z.string().max(80),
    minutes: z.number().int().min(15).max(120).multipleOf(5),
    window: z.enum(plannerWindows),
    subjects: z.array(z.object({ subjectId: z.uuid(), sessions: z.number().int().min(1).max(7) })).min(1).max(6),
  }),
]);
export type ComponentAction = z.infer<typeof componentActionSchema>;
/** Once answered, a question's answer and explanation are no longer secret and are kept here. */
export type QuizState = {
  answers: Record<string, { choice: number; correct: boolean; correctIndex: number; explanation: string }>;
};

/** The reply row, only if the conversation belongs to this student. */
async function ownedReply(userId: string, conversationId: string, requestId: string) {
  const [row] = await getDb()
    .select({ id: s.aiMessages.id, context: s.aiMessages.context, status: s.aiMessages.status })
    .from(s.aiMessages)
    .innerJoin(s.aiConversations, eq(s.aiConversations.id, s.aiMessages.conversationId))
    .where(
      and(
        eq(s.aiConversations.id, conversationId),
        eq(s.aiConversations.userId, userId),
        eq(s.aiMessages.requestId, requestId),
        eq(s.aiMessages.role, "assistant"),
      ),
    );
  if (!row || row.status === "superseded") throw new GoalError("recordUnavailable", 404);
  return row;
}
function component<T extends ReadyUiComponent["type"]>(
  context: Record<string, string> | null,
  id: string,
  type?: T,
) {
  const found = storedComponents(context).find((item) => item.id === id);
  if (!found || (type && found.type !== type)) throw new GoalError("recordUnavailable", 404);
  return found as Extract<ReadyUiComponent, { type: T }>;
}
/** Compare-and-set: writes only when the stored version still equals `base`. */
async function writeState<T>(rowId: string, componentId: string, base: number, data: T) {
  const key = `${STATE_PREFIX}${componentId}`;
  const next: SavedState<T> = { v: base + 1, data };
  const rows = await getDb()
    .update(s.aiMessages)
    .set({
      context: sql`COALESCE(${s.aiMessages.context}, '{}'::jsonb) || jsonb_build_object(${key}::text, ${JSON.stringify(next)}::text)`,
    })
    .where(
      and(
        eq(s.aiMessages.id, rowId),
        sql`COALESCE(((${s.aiMessages.context} ->> ${key})::jsonb ->> 'v')::int, 0) = ${base}`,
      ),
    )
    .returning({ id: s.aiMessages.id });
  return rows.length ? next : null;
}
async function currentState<T>(rowId: string, componentId: string) {
  const [row] = await getDb()
    .select({ context: s.aiMessages.context })
    .from(s.aiMessages)
    .where(eq(s.aiMessages.id, rowId));
  return savedState<T>(row?.context, componentId);
}
/** Server-authoritative update with a few retries on concurrent writes. */
async function updateState<T>(rowId: string, componentId: string, change: (current: T | undefined) => T) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await currentState<T>(rowId, componentId);
    const written = await writeState(rowId, componentId, current?.v ?? 0, change(current?.data));
    if (written) return written;
  }
  throw new GoalError("conflict", 409);
}

export async function performComponentAction(userId: string, action: ComponentAction) {
  const reply = await ownedReply(userId, action.conversationId, action.requestId);
  if (action.kind === "state") {
    const block = component(reply.context, action.componentId);
    if (!(block.type in componentStateSchemas)) throw new GoalError("invalidInput");
    const schema = componentStateSchemas[block.type as keyof typeof componentStateSchemas];
    const parsed = schema.safeParse(action.state);
    if (!parsed.success) throw new GoalError("invalidInput");
    if (block.type === "checklist" && !validChecklistState(block.data as ChecklistData, parsed.data as never))
      throw new GoalError("invalidInput");
    if (block.type === "flashcards" && !validFlashcardState(block.data as FlashcardsData, parsed.data as never))
      throw new GoalError("invalidInput");
    const written = await writeState(reply.id, action.componentId, action.base, parsed.data);
    if (written) return { ok: true as const, saved: true, state: written };
    // Another tab saved first: return its state so this tab can adopt it.
    return { ok: true as const, saved: false, conflict: true, state: await currentState(reply.id, action.componentId) };
  }
  if (action.kind === "quizAnswer" || action.kind === "quizReset") {
    const quiz = component(reply.context, action.componentId, "quiz").data as QuizData;
    if (action.kind === "quizReset")
      return { ok: true as const, state: await updateState<QuizState>(reply.id, action.componentId, () => ({ answers: {} })) };
    const question = quiz.questions.find((item) => item.id === action.questionId);
    if (!question || action.choice >= question.options.length) throw new GoalError("invalidInput");
    const secret = quizSecretSchema.safeParse(
      JSON.parse(reply.context?.[`${SECRET_PREFIX}${action.componentId}`] ?? "null"),
    );
    if (!secret.success || !(question.id in secret.data.answers)) throw new GoalError("recordUnavailable", 404);
    const correctIndex = secret.data.answers[question.id];
    // The first answer counts; a repeated or concurrent submission returns the same result.
    const state = await updateState<QuizState>(reply.id, action.componentId, (current) =>
      current?.answers[question.id]
        ? current
        : {
            answers: {
              ...current?.answers,
              [question.id]: {
                choice: action.choice,
                correct: action.choice === correctIndex,
                correctIndex,
                explanation: (secret.data.explanations[question.id] ?? "").slice(0, 800),
              },
            },
          },
    );
    return {
      ok: true as const,
      state,
      result: {
        questionId: question.id,
        correct: state.data.answers[question.id].correct,
        correctIndex,
        explanation: secret.data.explanations[question.id] ?? "",
      },
    };
  }
  if (action.kind === "saveChecklist") {
    const checklist = component(reply.context, action.componentId, "checklist").data as ChecklistData;
    const saved = savedState<{ checked: string[] }>(reply.context, action.componentId);
    const { timezone } = await getAvenPreferences(userId);
    const today = localDay(Date.now(), timezone);
    if (action.targetDate < today || action.targetDate > shiftDay(today, 366)) throw new GoalError("invalidInput");
    const checked = new Set(saved?.data.checked ?? []);
    const progress = checklistProgress(checklist, checked);
    // A reviewable goal proposal: nothing is created until the student approves the card.
    const proposal = await storeProposal(userId, action.conversationId, {
      kind: "goalPlan",
      goalId: null,
      expectedVersion: 0,
      // Approved goal plans always start tasks as to-do (an AI proposal never records work
      // as done), so ticks stay in the checklist and the wording does not promise otherwise.
      explanation: `Save the checklist "${checklist.title}" as a goal with ${progress.total} tasks, grouped into ${checklist.sections.length} milestones. New tasks start as to-do; ${progress.complete} of them are ticked in this checklist.`,
      goal: { title: checklist.title, description: "", startDate: today, targetDate: action.targetDate },
      milestones: checklist.sections.map((section, index) => ({
        key: section.id,
        value: { title: section.title, sortOrder: index },
        dependencyKeys: [],
      })),
      tasks: checklist.sections.flatMap((section) =>
        section.items.map((item) => ({
          key: item.id,
          milestoneKey: section.id,
          dependencyKeys: [],
          value: { title: item.label, description: item.hint ?? "" },
        })),
      ),
    });
    return { ok: true as const, proposal };
  }
  // replan: the same deterministic planner the tool uses, against the real calendar.
  const plannerBlock = component(reply.context, action.componentId, "study_planner");
  const current =
    savedState<StudyPlannerData>(reply.context, action.componentId)?.data ?? (plannerBlock.data as StudyPlannerData);
  const known = new Map(current.subjects.map((subject) => [subject.subjectId, subject]));
  // Only subjects the original plan resolved and verified may be planned again.
  if (action.subjects.some((subject) => !known.has(subject.subjectId))) throw new GoalError("invalidInput");
  const subjects = action.subjects.map((subject) => ({ ...known.get(subject.subjectId)!, sessions: subject.sessions }));
  const window = plannerWindow(action.window, plannerBlock.data as StudyPlannerData);
  const { timezone } = await getAvenPreferences(userId);
  const { plan, facts } = await planSubjectSessions(userId, timezone, {
    subjects,
    minutes: action.minutes,
    from: current.from,
    to: current.to,
    ...window,
  });
  const preview = {
    ...current,
    window: action.window,
    minutes: action.minutes,
    subjects,
    earliest: window.earliest,
    latest: window.latest,
    placed: plan.sessions.length,
    unplaced: plan.unplaced.reduce((sum, item) => sum + item.missing, 0),
    tradeoffs: facts.tradeoffs.slice(0, 10),
    dailyTargetMinutes: facts.dailyTargetMinutes,
  };
  if (!plan.sessions.length)
    return { ok: true as const, planned: false, reason: facts.constraint ?? "noFreeTime", preview };
  // Retire the previous draft first; only one request can win, so a double click cannot
  // leave two approvable versions. The old draft is restored if the new one fails.
  const retired = await getDb()
    .update(s.aiPlanProposals)
    .set({ status: "superseded", resolvedAt: new Date() })
    .where(
      and(
        eq(s.aiPlanProposals.id, current.proposalId),
        eq(s.aiPlanProposals.userId, userId),
        eq(s.aiPlanProposals.status, "pending"),
      ),
    )
    .returning({ id: s.aiPlanProposals.id });
  if (!retired.length) throw new GoalError("conflict", 409);
  let proposal;
  try {
    proposal = await storeProposal(
      userId,
      action.conversationId,
      scheduleProposal(
        `Adjusted plan: ${subjects.map((subject) => `${subject.sessions} × ${subject.title}`).join(", ")}, ${action.minutes} min each.`,
        plan,
      ),
    );
  } catch (error) {
    await getDb()
      .update(s.aiPlanProposals)
      .set({ status: "pending", resolvedAt: null })
      .where(inArray(s.aiPlanProposals.id, [current.proposalId]));
    throw error;
  }
  const planner = readyComponent("study_planner", { ...preview, proposalId: proposal.id });
  if (!planner) throw new GoalError("invalidProposal");
  const state = await updateState<StudyPlannerData>(reply.id, action.componentId, () => planner.data as StudyPlannerData);
  return {
    ok: true as const,
    planned: true,
    state,
    proposal,
    sessions: plan.sessions.map((item) => ({
      title: item.title,
      localStartsAt: wallTime(item.startsAt, timezone),
    })),
  };
}
