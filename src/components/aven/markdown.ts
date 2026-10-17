/**
 * Line-oriented Markdown subset used by Aven replies. Pure so it can be tested and re-run on
 * streamed frames. Raw HTML is never interpreted: everything becomes text in React elements.
 */
export interface ListItem {
  text: string;
  /** null for a plain item, true/false for a checklist item. */
  checked: boolean | null;
  children: ListItem[];
  ordered: boolean;
}
export type Block =
  | { kind: "code"; raw: string; language: string; text: string; open: boolean }
  | { kind: "math"; raw: string; text: string }
  | { kind: "heading"; raw: string; level: number; text: string }
  | { kind: "list"; raw: string; ordered: boolean; items: ListItem[] }
  | { kind: "table"; raw: string; header: string[]; rows: string[][]; align: ("start" | "center" | "end" | null)[] }
  | { kind: "quote"; raw: string; text: string }
  | { kind: "rule"; raw: string }
  | { kind: "paragraph"; raw: string; text: string };
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
const FENCE = /^\s*(```|~~~)\s*([\w+-]*)/;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const BLOCK_START = /^(#{1,6}\s|\s*```|\s*~~~|>|\s*(?:[-*+]|\d+[.)])\s|\s*\$\$)/;
const indentOf = (value: string) => value.replace(/\t/g, "    ").length;
/** Nested lists by indentation: two or more extra spaces start a sub-list of the previous item. */
function parseList(lines: string[], start: number) {
  const root: ListItem[] = [],
    stack: { indent: number; items: ListItem[] }[] = [];
  let index = start,
    last: ListItem | undefined;
  while (index < lines.length) {
    const line = lines[index],
      match = LIST_ITEM.exec(line);
    if (match) {
      const indent = indentOf(match[1]);
      if (!stack.length) stack.push({ indent, items: root });
      else if (last && indent >= stack[stack.length - 1].indent + 2)
        stack.push({ indent, items: last.children });
      else
        while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
      const check = /^\[([ xX])\]\s+(.*)$/.exec(match[4]);
      last = {
        text: check ? check[2] : match[4],
        checked: check ? check[1] !== " " : null,
        children: [],
        ordered: Boolean(match[3]),
      };
      stack[stack.length - 1].items.push(last);
    } else if (last && line.trim() && /^\s{2,}/.test(line))
      last.text += ` ${line.trim()}`;
    else break;
    index++;
  }
  return { items: root, end: index };
}
/** Tolerant of partial input while a reply is streaming: an unclosed fence renders as code. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n"),
    blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = FENCE.exec(line);
    if (fence) {
      const start = index++,
        marker = fence[1];
      while (index < lines.length && lines[index].trim() !== marker) index++;
      const open = index >= lines.length;
      const body = lines.slice(start + 1, index);
      index++;
      blocks.push({
        kind: "code",
        raw: lines.slice(start, index).join("\n"),
        language: fence[2],
        text: body.join("\n"),
        open,
      });
      continue;
    }
    if (!line.trim()) {
      index++;
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      const start = index;
      const single = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
      if (single) index++;
      else {
        index++;
        while (index < lines.length && !/\$\$\s*$/.test(lines[index])) index++;
        index++;
      }
      const raw = lines.slice(start, index).join("\n");
      blocks.push({ kind: "math", raw, text: raw.replace(/^\s*\$\$|\$\$\s*$/g, "").trim() });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", raw: line, level: heading[1].length, text: heading[2] });
      index++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule", raw: line });
      index++;
      continue;
    }
    if (line.trim().startsWith("|") && TABLE_SEPARATOR.test(lines[index + 1] ?? "")) {
      const start = index;
      const align = cells(lines[index + 1]).map((cell) =>
        cell.startsWith(":") && cell.endsWith(":")
          ? ("center" as const)
          : cell.endsWith(":")
            ? ("end" as const)
            : cell.startsWith(":")
              ? ("start" as const)
              : null,
      );
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) index++;
      const header = cells(lines[start]);
      blocks.push({
        kind: "table",
        raw: lines.slice(start, index).join("\n"),
        header,
        // Rows are padded or trimmed to the header so a short row never shifts columns.
        rows: lines
          .slice(start + 2, index)
          .map(cells)
          .map((row) => header.map((_, cell) => row[cell] ?? "")),
        align,
      });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const start = index,
        list = parseList(lines, index);
      index = list.end;
      blocks.push({
        kind: "list",
        raw: lines.slice(start, index).join("\n"),
        ordered: list.items[0]?.ordered ?? false,
        items: list.items,
      });
      continue;
    }
    if (line.startsWith(">")) {
      const start = index;
      while (index < lines.length && lines[index].startsWith(">")) index++;
      const quote = lines.slice(start, index);
      blocks.push({
        kind: "quote",
        raw: quote.join("\n"),
        text: quote.map((value) => value.replace(/^>\s?/, "")).join("\n"),
      });
      continue;
    }
    const start = index;
    while (index < lines.length && lines[index].trim() && !BLOCK_START.test(lines[index])) index++;
    const paragraph = lines.slice(start, Math.max(index, start + 1));
    index = Math.max(index, start + 1);
    blocks.push({ kind: "paragraph", raw: paragraph.join("\n"), text: paragraph.join("\n") });
  }
  return blocks;
}
const fenceCount = (text: string) =>
  text.split("\n").filter((line) => FENCE.test(line)).length;
/**
 * Prepares the visible part of a reply that is still streaming, so half-arrived syntax does
 * not flash as raw characters and then jump into a different layout:
 * - a table row still being written, or a table header whose separator has not arrived, waits;
 * - an unmatched trailing `**`, `*`, `~~` or backtick on the last line is closed virtually.
 * Completed text is never altered.
 */
export function streamingView(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  if (fenceCount(normalized) % 2 === 1) return normalized;
  const lines = normalized.split("\n");
  // A partial table row (no newline yet) waits until the row is complete.
  if (lines.length && lines[lines.length - 1].trim().startsWith("|")) lines.pop();
  // A lone table header waits for its separator line, so it does not render as a paragraph first.
  const last = lines.length - 1;
  if (
    last >= 0 &&
    lines[last].trim().startsWith("|") &&
    (last === 0 || !lines[last - 1].trim().startsWith("|"))
  )
    lines.pop();
  let tail = lines.pop() ?? "";
  const close = (marker: string, pattern: RegExp) => {
    if (((tail.match(pattern) ?? []).length) % 2 === 1)
      tail = tail.replace(/\s+$/, "") + marker;
  };
  close("`", /`/g);
  if (!/`/.test(tail)) {
    close("**", /\*\*/g);
    close("~~", /~~/g);
    const singles = tail
      .replace(/^\s*[-*+]\s/, "")
      .replace(/\*\*/g, "")
      .split("*").length - 1;
    if (singles % 2 === 1) tail = tail.replace(/\s+$/, "") + "*";
  }
  return [...lines, tail].join("\n");
}
/**
 * Splits text into a stable prefix (ending at a blank line outside any code fence) and the
 * tail still changing. The prefix's blocks can be parsed once and reused for every frame.
 */
export function splitStable(text: string): [string, string] {
  let cut = text.lastIndexOf("\n\n");
  while (cut > 0) {
    const prefix = text.slice(0, cut);
    if (fenceCount(prefix) % 2 === 0 && !/\n\s*\$\$[^\n]*$/.test(prefix.slice(prefix.lastIndexOf("\n\n"))))
      return [prefix, text.slice(cut + 2)];
    cut = text.lastIndexOf("\n\n", cut - 1);
  }
  return ["", text];
}
