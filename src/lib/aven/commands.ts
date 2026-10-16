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
  | "general";
export interface AvenCommand {
  name: string;
  workflow: AvenWorkflow;
  /** Mention types worth suggesting right after the command. */
  mentions: readonly MentionType[];
}
export const avenCommands = [
  { name: "plan", workflow: "plan", mentions: ["goal", "subject"] },
  { name: "schedule", workflow: "schedule", mentions: ["subject", "topic", "goal", "session"] },
  { name: "catchup", workflow: "catchup", mentions: ["goal", "subject"] },
  { name: "review", workflow: "review", mentions: ["goal", "subject"] },
  { name: "practice", workflow: "practice", mentions: ["subject", "topic"] },
  { name: "goals", workflow: "goals", mentions: ["goal", "milestone", "task"] },
  { name: "subjects", workflow: "subjects", mentions: ["subject", "topic", "resource"] },
  { name: "progress", workflow: "progress", mentions: ["subject", "goal"] },
  { name: "friends", workflow: "friends", mentions: ["friend", "circle"] },
  { name: "help", workflow: "help", mentions: [] },
] as const satisfies readonly AvenCommand[];
export type AvenCommandName = (typeof avenCommands)[number]["name"];
/** A leading "/name" (case-insensitive) followed by whitespace or the end of the message. */
export function parseCommand(message: string) {
  const match = /^\s*\/([a-z]+)(?=\s|$)/i.exec(message);
  const command = match
    ? avenCommands.find((item) => item.name === match[1].toLowerCase())
    : undefined;
  return command
    ? { command, rest: message.slice(match![0].length).trim() }
    : { command: null, rest: message.trim() };
}
export function matchCommands(query: string) {
  const wanted = query.toLowerCase();
  return avenCommands.filter((item) => item.name.startsWith(wanted));
}
