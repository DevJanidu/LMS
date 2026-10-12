/** Line-oriented Markdown subset used by Aven replies. Pure so it can be tested and re-run on every streamed frame. */
export type Block =
  | { kind: "code"; raw: string; language: string; text: string }
  | { kind: "heading"; raw: string; level: number; text: string }
  | { kind: "list"; raw: string; ordered: boolean; items: string[] }
  | { kind: "table"; raw: string; header: string[]; rows: string[][] }
  | { kind: "quote"; raw: string; text: string }
  | { kind: "rule"; raw: string }
  | { kind: "paragraph"; raw: string; text: string };
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
/** Tolerant of partial input while a reply is streaming: an unclosed fence renders as code. */
export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n"),
    blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const fence = /^\s*```(\w*)/.exec(line);
    if (fence) {
      const start = index++;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) index++;
      const body = lines.slice(start + 1, index);
      index++;
      blocks.push({
        kind: "code",
        raw: lines.slice(start, index).join("\n"),
        language: fence[1],
        text: body.join("\n"),
      });
      continue;
    }
    if (!line.trim()) {
      index++;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        raw: line,
        level: heading[1].length,
        text: heading[2],
      });
      index++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule", raw: line });
      index++;
      continue;
    }
    if (
      line.trim().startsWith("|") &&
      /^\s*\|?\s*:?-{2,}/.test(lines[index + 1] ?? "")
    ) {
      const start = index;
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|"))
        index++;
      blocks.push({
        kind: "table",
        raw: lines.slice(start, index).join("\n"),
        header: cells(lines[start]),
        rows: lines.slice(start + 2, index).map(cells),
      });
      continue;
    }
    const listItem = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/;
    const item = listItem.exec(line);
    if (item) {
      const start = index,
        ordered = Boolean(item[1]),
        items: string[] = [];
      while (index < lines.length) {
        const next = listItem.exec(lines[index]);
        if (next && Boolean(next[1]) === ordered) items.push(next[2]);
        else if (lines[index].trim() && /^\s{2,}/.test(lines[index]))
          items[items.length - 1] += ` ${lines[index].trim()}`;
        else break;
        index++;
      }
      blocks.push({
        kind: "list",
        raw: lines.slice(start, index).join("\n"),
        ordered,
        items,
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
        text: quote.map((value) => value.replace(/^>\s?/, "")).join(" "),
      });
      continue;
    }
    const start = index;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,4}\s|\s*```|>|\s*(?:[-*+]|\d+[.)])\s)/.test(lines[index])
    )
      index++;
    const paragraph = lines.slice(start, Math.max(index, start + 1));
    index = Math.max(index, start + 1);
    blocks.push({
      kind: "paragraph",
      raw: paragraph.join("\n"),
      text: paragraph.join("\n"),
    });
  }
  return blocks;
}
