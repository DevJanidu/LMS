import { z } from "zod";
/**
 * Schemas for blocks the model authors through presentation tools (checklists, quizzes,
 * flashcards, diagrams, study targets) and for the server-built interactive study planner.
 * Every string is bounded, every list is capped, IDs are short slugs, and cross-references
 * (diagram edges, answer keys) are checked, so a payload cannot grow without limit or
 * point at something that does not exist. Labels are plain text; nothing is ever treated
 * as markup or code.
 */
export const blockId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const unique = (ids: string[]) => new Set(ids).size === ids.length;
export const MAX_BLOCK_BYTES = 24000;

export const checklistSchema = z
  .object({
    title: text(120),
    sections: z
      .array(
        z.object({
          id: blockId,
          title: text(120),
          items: z
            .array(z.object({ id: blockId, label: text(200), hint: z.string().trim().max(200).nullable() }))
            .min(1)
            .max(15),
        }),
      )
      .min(1)
      .max(8),
  })
  .refine((value) => value.sections.flatMap((section) => section.items).length <= 60, "tooManyItems")
  .refine(
    (value) =>
      unique(value.sections.map((section) => section.id)) &&
      unique(value.sections.flatMap((section) => section.items.map((item) => item.id))),
    "duplicateIds",
  );
export type ChecklistData = z.infer<typeof checklistSchema>;

/** What the browser receives: questions and options, never the answer key. */
export const quizSchema = z
  .object({
    title: text(120),
    questions: z
      .array(z.object({ id: blockId, prompt: text(500), options: z.array(text(200)).min(2).max(6) }))
      .min(1)
      .max(10),
  })
  .refine((value) => unique(value.questions.map((question) => question.id)), "duplicateIds");
export type QuizData = z.infer<typeof quizSchema>;
/** Stored server-side only, next to the reply, and used for grading. */
export const quizSecretSchema = z.object({
  answers: z.record(blockId, z.number().int().min(0).max(5)),
  explanations: z.record(blockId, z.string().max(800)),
});
export type QuizSecret = z.infer<typeof quizSecretSchema>;

export const flashcardsSchema = z
  .object({
    title: text(120),
    cards: z.array(z.object({ id: blockId, front: text(300), back: text(600) })).min(1).max(30),
  })
  .refine((value) => unique(value.cards.map((card) => card.id)), "duplicateIds");
export type FlashcardsData = z.infer<typeof flashcardsSchema>;

export const diagramSchema = z
  .object({
    title: text(120),
    kind: z.enum(["flow", "architecture", "roadmap", "concepts"]),
    nodes: z
      .array(
        z.object({
          id: blockId,
          label: text(60),
          detail: z.string().trim().max(300).nullable(),
          group: z.string().trim().max(40).nullable(),
        }),
      )
      .min(2)
      .max(24),
    edges: z
      .array(z.object({ from: blockId, to: blockId, label: z.string().trim().max(40).nullable() }))
      .max(40),
  })
  .refine((value) => unique(value.nodes.map((node) => node.id)), "duplicateIds")
  .refine((value) => {
    const ids = new Set(value.nodes.map((node) => node.id));
    return value.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to);
  }, "invalidEdges");
export type DiagramData = z.infer<typeof diagramSchema>;

export const TECHNIQUES = ["pomodoro", "timeBlocking", "spacedRepetition", "activeRecall", "deepWork"] as const;
export const TIMES_OF_DAY = ["morning", "afternoon", "evening", "flexible"] as const;
export const studyTargetsSchema = z.object({
  title: text(120),
  weeklyHours: z.number().int().min(1).max(60),
  sessionMinutes: z.number().int().min(15).max(180).multipleOf(5),
  breakMinutes: z.number().int().min(0).max(30),
  technique: z.enum(TECHNIQUES),
  timeOfDay: z.enum(TIMES_OF_DAY),
});
export type StudyTargetsData = z.infer<typeof studyTargetsSchema>;

/** Server-built from a real scheduling proposal; the controls re-plan without the model. */
export const plannerWindows = ["requested", "morning", "afternoon", "evening"] as const;
export const studyPlannerSchema = z.object({
  proposalId: z.uuid(),
  from: z.iso.date(),
  to: z.iso.date(),
  earliest: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  latest: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  window: z.enum(plannerWindows),
  minutes: z.number().int().min(15).max(120).multipleOf(15),
  dailyTargetMinutes: z.number().int().min(0).max(1440),
  studyDays: z.array(z.number().int().min(0).max(6)).max(7),
  subjects: z
    .array(z.object({ subjectId: z.uuid(), title: z.string().max(150), sessions: z.number().int().min(1).max(7) }))
    .min(1)
    .max(6),
  placed: z.number().int().min(0).max(42),
  unplaced: z.number().int().min(0).max(42),
  tradeoffs: z.array(z.object({ title: z.string().max(200), localStartsAt: z.string().max(40) })).max(10),
});
export type StudyPlannerData = z.infer<typeof studyPlannerSchema>;

/** Minutes the planner would schedule; recalculated locally on every control change. */
export function plannerTotals(subjects: { sessions: number }[], minutes: number) {
  const sessions = subjects.reduce((sum, subject) => sum + subject.sessions, 0);
  return { sessions, minutes: sessions * minutes };
}
/** Weekly study-target arithmetic shown live under the sliders. */
export function targetSummary(value: Pick<StudyTargetsData, "weeklyHours" | "sessionMinutes" | "breakMinutes">) {
  const sessions = Math.ceil((value.weeklyHours * 60) / value.sessionMinutes);
  return {
    sessionsPerWeek: sessions,
    perDayMinutes: Math.round((value.weeklyHours * 60) / 7),
    breakMinutesPerWeek: Math.max(0, sessions - 1) * value.breakMinutes,
  };
}
/** Hour window for a planner preset; "requested" keeps what the student asked for. */
export function plannerWindow(window: (typeof plannerWindows)[number], requested: { earliest: string; latest: string }) {
  if (window === "morning") return { earliest: "07:00", latest: "12:00" };
  if (window === "afternoon") return { earliest: "12:00", latest: "17:00" };
  if (window === "evening") return { earliest: "17:00", latest: "22:00" };
  return requested;
}

/** Interaction state a block may save, validated against the block it belongs to. */
export const componentStateSchemas = {
  checklist: z.object({ checked: z.array(blockId).max(60), collapsed: z.array(blockId).max(8) }),
  flashcards: z.object({ index: z.number().int().min(0).max(29), known: z.array(blockId).max(30), reviewing: z.array(blockId).max(30) }),
  study_targets: studyTargetsSchema.omit({ title: true }),
} as const;
export type StatefulType = keyof typeof componentStateSchemas;
/** Saved checklist state may only reference items and sections the checklist has. */
export function validChecklistState(data: ChecklistData, state: z.infer<typeof componentStateSchemas.checklist>) {
  const items = new Set(data.sections.flatMap((section) => section.items.map((item) => item.id)));
  const sections = new Set(data.sections.map((section) => section.id));
  return state.checked.every((id) => items.has(id)) && state.collapsed.every((id) => sections.has(id));
}
export function validFlashcardState(data: FlashcardsData, state: z.infer<typeof componentStateSchemas.flashcards>) {
  const cards = new Set(data.cards.map((card) => card.id));
  return state.index < data.cards.length && [...state.known, ...state.reviewing].every((id) => cards.has(id));
}
/** Checklist progress, computed locally from the saved or optimistic state. */
export function checklistProgress(data: ChecklistData, checked: Iterable<string>) {
  const done = new Set(checked);
  const sections = data.sections.map((section) => ({
    id: section.id,
    done: section.items.filter((item) => done.has(item.id)).length,
    total: section.items.length,
  }));
  const total = sections.reduce((sum, section) => sum + section.total, 0),
    complete = sections.reduce((sum, section) => sum + section.done, 0);
  return { complete, total, percent: total ? Math.round((complete / total) * 100) : 0, sections };
}
