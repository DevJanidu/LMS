/**
 * Client-safe vocabulary for Aven's model and reasoning controls. The browser only ever
 * sends these keys; the server maps them to verified API model IDs and parameters
 * (`models.ts`), so a client can never choose an arbitrary or unauthorized model.
 */
export const MODEL_KEYS = ["sol", "luna"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];
export const DEFAULT_MODEL_KEY: ModelKey = "sol";
export const REASONING_MODES = ["auto", "quick", "balanced", "deep", "extended"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];
export const DETAIL_LEVELS = ["concise", "balanced", "detailed"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];
/** OpenAI reasoning efforts this app knows about (verified per model in `models.ts`). */
export const EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export interface ModelOption {
  key: ModelKey;
  label: string;
  description: string;
  recommended: boolean;
  /** The API model this option sends, shown for transparency. */
  apiModel: string;
  available: boolean;
  /** Why the option cannot be used: missing configuration or the student's plan. */
  unavailableReason: "notConfigured" | "plan" | null;
  /** Reasoning modes this model supports with a real API setting. */
  modes: ReasoningMode[];
}
export interface ModelSettings {
  model: ModelKey;
  reasoning: ReasoningMode;
  detail: DetailLevel;
  /** Interactive blocks (checklists, quizzes, diagrams…) may be offered. */
  interactive: boolean;
}
