import { z } from "zod";
import { GoalError } from "@/lib/goals/service";
import {
  blockId,
  TECHNIQUES,
  TIMES_OF_DAY,
  type QuizSecret,
} from "./ui-blocks";
import { readyComponent, type ReadyUiComponent } from "./ui-components";
/**
 * Presentation tools let the model choose an approved interactive block and supply its
 * content as typed arguments. They read and write no records: the server validates the
 * arguments against the registry and streams the block. Strict function schemas keep the
 * model's output well-formed; the registry re-validates refinements the JSON schema cannot
 * express (unique IDs, edge references, totals).
 */
const text = (max: number) => z.string().min(1).max(max);
const toolSchemas = {
  showChecklist: z.object({
    title: text(120),
    sections: z
      .array(
        z.object({
          id: blockId,
          title: text(120),
          items: z.array(z.object({ id: blockId, label: text(200), hint: z.string().max(200).nullable() })).min(1).max(15),
        }),
      )
      .min(1)
      .max(8),
  }),
  showQuiz: z.object({
    title: text(120),
    questions: z
      .array(
        z.object({
          id: blockId,
          prompt: text(500),
          options: z.array(text(200)).min(2).max(6),
          correctIndex: z.number().int().min(0).max(5),
          explanation: z.string().max(800),
        }),
      )
      .min(1)
      .max(10),
  }),
  showFlashcards: z.object({
    title: text(120),
    cards: z.array(z.object({ id: blockId, front: text(300), back: text(600) })).min(1).max(30),
  }),
  showDiagram: z.object({
    title: text(120),
    kind: z.enum(["flow", "architecture", "roadmap", "concepts"]),
    nodes: z
      .array(z.object({ id: blockId, label: text(60), detail: z.string().max(300).nullable(), group: z.string().max(40).nullable() }))
      .min(2)
      .max(24),
    edges: z.array(z.object({ from: blockId, to: blockId, label: z.string().max(40).nullable() })).max(40),
  }),
  showStudyTargets: z.object({
    title: text(120),
    weeklyHours: z.number().int().min(1).max(60),
    sessionMinutes: z.number().int().min(15).max(180),
    breakMinutes: z.number().int().min(0).max(30),
    technique: z.enum(TECHNIQUES),
    timeOfDay: z.enum(TIMES_OF_DAY),
  }),
} as const;
export type PresentationToolName = keyof typeof toolSchemas;
const descriptions: Record<PresentationToolName, string> = {
  showChecklist:
    "Show an interactive checklist with real checkboxes, live progress and saved completion. Use when the student asks for a checklist, to-do list or preparation steps. Group items into short sections; ids are short slugs. Never write checklist characters like [ ] in text instead.",
  showQuiz:
    "Show an interactive multiple-choice quiz. The answer key and explanations stay on the server and are revealed one question at a time after the student answers, so never state the answers in your text. Use for 'quiz me' or practice questions.",
  showFlashcards:
    "Show a flashcard deck the student can flip and mark as known. Fronts are prompts or terms, backs are concise answers.",
  showDiagram:
    "Show a structured diagram of nodes and directed edges (flowchart, architecture, roadmap or concept map) for explanations that benefit from a picture, such as how AI agents work or a learning roadmap. Labels are short plain text; put detail in node.detail. Do not use for simple definitions.",
  showStudyTargets:
    "Show sliders and choices for weekly study targets (hours per week, session and break length, technique, time of day) with live arithmetic. Use when the student wants help setting study targets; it changes nothing until they choose to.",
};
export const PRESENTATION_TOOLS = Object.keys(toolSchemas) as PresentationToolName[];
export const isPresentationTool = (name: string): name is PresentationToolName =>
  Object.hasOwn(toolSchemas, name);
export const presentationComponentType: Record<PresentationToolName, ReadyUiComponent["type"]> = {
  showChecklist: "checklist",
  showQuiz: "quiz",
  showFlashcards: "flashcards",
  showDiagram: "diagram",
  showStudyTargets: "study_targets",
};
export function presentationToolDefinitions(strict: (schema: z.ZodType) => unknown) {
  return PRESENTATION_TOOLS.map((name) => ({
    type: "function",
    name,
    strict: true,
    description: descriptions[name],
    parameters: strict(toolSchemas[name]),
  }));
}
/** Stable, short component id per tool call, so a placeholder and its block share one slot. */
export function presentationComponentId(name: PresentationToolName, callId: string) {
  const suffix = callId.replace(/[^A-Za-z0-9]/g, "").slice(-12) || "0";
  return `${presentationComponentType[name]}-${suffix}`;
}
/**
 * Validates a presentation call. Returns the public block and, for quizzes, the answer key
 * kept server-side. Invalid content throws; the model is told and no block is shown.
 */
export function buildPresentation(
  name: PresentationToolName,
  raw: unknown,
  callId: string,
): { component: ReadyUiComponent; secret?: QuizSecret } {
  const parsed = toolSchemas[name].safeParse(raw);
  if (!parsed.success) throw new GoalError("invalidToolInput");
  const id = presentationComponentId(name, callId);
  let data: unknown = parsed.data,
    secret: QuizSecret | undefined;
  if (name === "showQuiz") {
    const quiz = parsed.data as z.infer<typeof toolSchemas.showQuiz>;
    if (quiz.questions.some((question) => question.correctIndex >= question.options.length))
      throw new GoalError("invalidToolInput");
    data = {
      title: quiz.title,
      questions: quiz.questions.map(({ id: questionId, prompt, options }) => ({ id: questionId, prompt, options })),
    };
    secret = {
      answers: Object.fromEntries(quiz.questions.map((question) => [question.id, question.correctIndex])),
      explanations: Object.fromEntries(quiz.questions.map((question) => [question.id, question.explanation])),
    };
  }
  if (name === "showStudyTargets") {
    const targets = parsed.data as z.infer<typeof toolSchemas.showStudyTargets>;
    data = { ...targets, sessionMinutes: Math.round(targets.sessionMinutes / 5) * 5 };
  }
  const component = readyComponent(presentationComponentType[name], data, id);
  if (!component) throw new GoalError("invalidToolInput");
  return { component, ...(secret ? { secret } : {}) };
}
