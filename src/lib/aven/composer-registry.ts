import type { AvenCommandName } from "./commands";
/**
 * Typed registry for the composer's "/" and "+" menus. Adding an entry here is enough to
 * show it; the UI never hard-codes items. Every action is real: commands are routed by
 * the server (commands.ts), client actions use existing app features, and anything
 * without an integration is listed as unavailable with a reason instead of faked.
 */
export type ComposerIcon =
  | "book" | "search" | "calendar" | "target" | "chart" | "fileText" | "bot" | "mic"
  | "message" | "sparkles" | "timer" | "list" | "group" | "folder" | "paperclip"
  | "library" | "globe" | "plus" | "help";
export type ComposerAction =
  /** Inserts "/name " (and optional text) for the server to route. */
  | { type: "command"; command: AvenCommandName; text?: string }
  | { type: "dictate" }
  | { type: "attachFiles" }
  | { type: "pickLibrary" }
  | { type: "navigate"; href: "/study" };
export interface ComposerEnvironment {
  /** Browser speech recognition is present. */
  speech: boolean;
  /** Files can be attached (consent given, not generating). */
  uploads: boolean;
}
export type Availability = { available: true } | { available: false; reason: string };
export interface ComposerItem {
  id: string;
  icon: ComposerIcon;
  /** Message keys under aven.composerItems.<id>: label, description. */
  keywords?: string[];
  action?: ComposerAction;
  children?: ComposerItem[];
  availability?: (env: ComposerEnvironment) => Availability;
}
const always = () => ({ available: true as const });
const unavailable = (reason: string) => () => ({ available: false as const, reason });
export const slashItems: ComposerItem[] = [
  {
    id: "study",
    icon: "book",
    keywords: ["learn", "lesson", "quiz", "focus"],
    children: [
      { id: "studyGuided", icon: "book", action: { type: "command", command: "study" } },
      { id: "studyQuiz", icon: "help", action: { type: "command", command: "study", text: "Quiz me on " } },
      { id: "studyTimer", icon: "timer", action: { type: "navigate", href: "/study" } },
    ],
  },
  { id: "search", icon: "search", keywords: ["find", "look"], action: { type: "command", command: "search" } },
  { id: "plan", icon: "calendar", keywords: ["roadmap", "study plan"], action: { type: "command", command: "plan" } },
  { id: "schedule", icon: "calendar", keywords: ["session", "time", "calendar"], action: { type: "command", command: "schedule" } },
  { id: "goals", icon: "target", keywords: ["milestone", "task"], action: { type: "command", command: "goals" } },
  { id: "analyze", icon: "chart", keywords: ["progress", "review", "health"], action: { type: "command", command: "analyze" } },
  { id: "summarize", icon: "fileText", keywords: ["summary", "notes"], action: { type: "command", command: "summarize" } },
  { id: "practice", icon: "sparkles", keywords: ["weak", "drill"], action: { type: "command", command: "practice" } },
  { id: "catchup", icon: "list", keywords: ["missed", "behind", "overdue"], action: { type: "command", command: "catchup" } },
  { id: "progress", icon: "chart", keywords: ["stats", "hours"], action: { type: "command", command: "progress" } },
  { id: "subjects", icon: "folder", keywords: ["topics"], action: { type: "command", command: "subjects" } },
  { id: "friends", icon: "group", keywords: ["circles", "leaderboard", "group"], action: { type: "command", command: "friends" } },
  {
    id: "dictate",
    icon: "mic",
    keywords: ["voice", "speech", "talk"],
    action: { type: "dictate" },
    availability: (env) =>
      env.speech ? { available: true } : { available: false, reason: "speechUnsupported" },
  },
  { id: "model", icon: "bot", keywords: ["gpt", "ai"], availability: unavailable("modelFixed") },
  { id: "feedback", icon: "message", keywords: ["report", "bug"], availability: unavailable("feedbackUnavailable") },
  { id: "help", icon: "help", action: { type: "command", command: "help" } },
];
export const plusItems: ComposerItem[] = [
  {
    id: "attachFiles",
    icon: "paperclip",
    action: { type: "attachFiles" },
    availability: (env) => (env.uploads ? { available: true } : { available: false, reason: "uploadsUnavailable" }),
  },
  { id: "addFromLibrary", icon: "library", action: { type: "pickLibrary" } },
  { id: "webSearch", icon: "globe", availability: unavailable("webSearchUnavailable") },
  { id: "createPlan", icon: "calendar", action: { type: "command", command: "plan", text: "Create a study plan for " } },
  { id: "createGoal", icon: "target", action: { type: "command", command: "plan", text: "I want to " } },
  { id: "studyTools", icon: "timer", action: { type: "navigate", href: "/study" } },
];
export function availabilityOf(item: ComposerItem, env: ComposerEnvironment): Availability {
  return (item.availability ?? always)(env);
}
/** Ordered subsequence match ("stu" in "study", "sm" in "summarize"). */
function subsequence(query: string, text: string) {
  let index = 0;
  for (const char of text) if (char === query[index]) index++;
  return index === query.length;
}
/**
 * Prefix matches first, then substring matches in the id or keywords, then fuzzy
 * subsequence matches. An empty query keeps registry order.
 */
export function filterItems(items: ComposerItem[], query: string, labels: (id: string) => string) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return items;
  const scored = items.flatMap((item) => {
    const names = [item.id.toLowerCase(), labels(item.id).toLowerCase()];
    const words = (item.keywords ?? []).map((word) => word.toLowerCase());
    const score = names.some((name) => name.startsWith(wanted))
      ? 0
      : [...names, ...words].some((name) => name.includes(wanted))
        ? 1
        : names.some((name) => subsequence(wanted, name))
          ? 2
          : -1;
    return score < 0 ? [] : [{ item, score }];
  });
  return scored.sort((a, b) => a.score - b.score).map((entry) => entry.item);
}
