import { z } from "zod";
/**
 * Shared (client and server) registry of Aven slash commands and mention types.
 * The server parses commands itself; the client list only drives discovery.
 */
export const mentionTypes = [
  "subject",
  "topic",
  "goal",
  "milestone",
  "task",
  "session",
  "resource",
  "friend",
  "circle",
] as const;
export type MentionType = (typeof mentionTypes)[number];
/** What the client sends: a type and ID only. Labels are always re-read from the database. */
export const mentionReferenceSchema = z.object({
  type: z.enum(mentionTypes),
  id: z.uuid(),
});
export type MentionReference = z.infer<typeof mentionReferenceSchema>;
export const MAX_MENTIONS = 10;
export type AvenWorkflow =
  | "plan"
  | "schedule"
  | "catchup"
  | "review"
  | "practice"
  | "goals"
  | "subjects"
  | "progress"
  | "friends"
  | "help"
  | "study"
  | "search"
  | "summarize"
  | "general";
export interface AvenCommand {
  name: string;
  workflow: AvenWorkflow;
  /** Mention types worth suggesting right after the command. */
  mentions: readonly MentionType[];
}
export const avenCommands = [
  { name: "study", workflow: "study", mentions: ["topic", "subject", "resource"] },
  { name: "search", workflow: "search", mentions: [] },
  { name: "plan", workflow: "plan", mentions: ["goal", "subject"] },
  { name: "schedule", workflow: "schedule", mentions: ["subject", "topic", "goal", "session"] },
  { name: "catchup", workflow: "catchup", mentions: ["goal", "subject"] },
  { name: "review", workflow: "review", mentions: ["goal", "subject"] },
  { name: "analyze", workflow: "review", mentions: ["goal", "subject"] },
  { name: "summarize", workflow: "summarize", mentions: ["resource", "topic"] },
  { name: "practice", workflow: "practice", mentions: ["subject", "topic"] },
  { name: "goals", workflow: "goals", mentions: ["goal", "milestone", "task"] },
  { name: "subjects", workflow: "subjects", mentions: ["subject", "topic", "resource"] },
  { name: "progress", workflow: "progress", mentions: ["subject", "goal"] },
  { name: "friends", workflow: "friends", mentions: ["friend", "circle"] },
  { name: "help", workflow: "help", mentions: [] },
] as const satisfies readonly AvenCommand[];
export type AvenCommandName = (typeof avenCommands)[number]["name"];
const COMMAND_TOKEN = /(^|\s)\/([a-z]+)(?=\s|$)/gi;
/**
 * The first registered "/name" token: at the start or after whitespace, followed by
 * whitespace or the end. "and/or", URLs and unknown names stay ordinary text.
 */
export function parseCommand(message: string) {
  for (const match of message.matchAll(COMMAND_TOKEN)) {
    const command = avenCommands.find((item) => item.name === match[2].toLowerCase());
    if (!command) continue;
    const start = match.index + match[1].length;
    const end = start + match[2].length + 1;
    const rest = `${message.slice(0, start)} ${message.slice(end)}`.replace(/\s+/g, " ").trim();
    return { command, rest, start, end };
  }
  return { command: null, rest: message.trim(), start: -1, end: -1 };
}
export function matchCommands(query: string) {
  const wanted = query.toLowerCase();
  return avenCommands.filter((item) => item.name.startsWith(wanted));
}
