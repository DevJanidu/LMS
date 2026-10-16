import { parseCommand, type MentionType } from "@/lib/aven/commands";
/** A mention chosen from the menu. The label is what the composer shows after "@". */
export interface ComposerMention {
  type: MentionType;
  id: string;
  label: string;
}
export type Trigger =
  | { kind: "command"; start: number; query: string }
  | { kind: "mention"; start: number; query: string };
const MAX_QUERY = 40;
/**
 * The autocomplete trigger at the caret: "/word" at the start or after whitespace
 * (so "and/or" and URLs never open the menu), or "@words" after whitespace (names may
 * contain spaces, up to 4 words and 40 characters).
 */
export function findTrigger(value: string, caret: number): Trigger | null {
  const before = value.slice(0, caret);
  const command = /(^|\s)\/([a-z]*)$/i.exec(before);
  if (command)
    return { kind: "command", start: command.index + command[1].length, query: command[2] };
  const at = before.lastIndexOf("@");
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (
    query.length > MAX_QUERY ||
    /[\n@]/.test(query) ||
    /^\s/.test(query) ||
    /\s{2,}$/.test(query) ||
    query.split(/\s+/).length > 4
  )
    return null;
  return { kind: "mention", start: at, query };
}
export const mentionToken = (label: string) => `@${label}`;
/** Replaces the trigger text with the chosen token and a trailing space; returns the new caret. */
export function applySelection(
  value: string,
  trigger: Trigger,
  caret: number,
  text: string,
) {
  const insert = `${text} `;
  const after = value.slice(caret).replace(/^ /, "");
  return {
    value: value.slice(0, trigger.start) + insert + after,
    caret: trigger.start + insert.length,
  };
}
function occurrences(value: string, token: string) {
  const found: number[] = [];
  for (let index = value.indexOf(token); index >= 0; index = value.indexOf(token, index + 1)) {
    const end = index + token.length;
    // A token must stand alone: "@Java" does not match inside "@JavaScript".
    if (end === value.length || /[\s.,;:!?)]/.test(value[end])) found.push(index);
  }
  return found;
}
/**
 * Mentions still present in the text. Two records with the same name are kept in the
 * order they were chosen, as long as the text still contains that many tokens.
 */
export function activeMentions(value: string, mentions: ComposerMention[]) {
  const seen = new Map<string, number>();
  return mentions.filter((mention) => {
    const token = mentionToken(mention.label);
    const used = seen.get(token) ?? 0;
    if (occurrences(value, token).length <= used) return false;
    seen.set(token, used + 1);
    return true;
  });
}
export interface Segment {
  text: string;
  kind: "text" | "mention" | "command";
  type?: MentionType;
}
/** Text split into plain, command and mention segments for the highlight layer. */
export function highlightSegments(value: string, mentions: ComposerMention[]): Segment[] {
  const marks: { start: number; end: number; kind: Segment["kind"]; type?: MentionType }[] = [];
  // Highlight exactly the command the server will use (the first registered token).
  const command = parseCommand(value);
  if (command.command) marks.push({ start: command.start, end: command.end, kind: "command" });
  const used = new Set<number>();
  for (const mention of activeMentions(value, mentions)) {
    const token = mentionToken(mention.label);
    const start = occurrences(value, token).find((index) => !used.has(index));
    if (start === undefined) continue;
    used.add(start);
    marks.push({ start, end: start + token.length, kind: "mention", type: mention.type });
  }
  marks.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) segments.push({ text: value.slice(cursor, mark.start), kind: "text" });
    segments.push({ text: value.slice(mark.start, mark.end), kind: mark.kind, type: mark.type });
    cursor = mark.end;
  }
  if (cursor < value.length) segments.push({ text: value.slice(cursor), kind: "text" });
  return segments;
}
/** Arrow-key movement through the menu, wrapping at both ends. */
export function moveActive(index: number, delta: number, count: number) {
  if (!count) return -1;
  return (((index + delta) % count) + count) % count;
}
/** "/help" alone is answered in the interface without a model call. */
export const isBareHelp = (value: string) => /^\s*\/help\s*$/i.test(value);
