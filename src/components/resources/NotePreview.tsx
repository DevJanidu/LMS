import { Fragment, type ReactNode } from "react";
interface Props {
  text: string;
}
function inline(text: string): ReactNode {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}
/** Render headings, lists and bold text without HTML injection. */
export default function NotePreview({ text }: Props) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].startsWith("- "))
        items.push(lines[index++].slice(2));
      blocks.push(
        <ul key={index} className="ms-5 list-disc space-y-1">
          {items.map((item, number) => (
            <li key={number}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (line.startsWith("# "))
      blocks.push(
        <h3 key={index} className="text-lg font-semibold">
          {inline(line.slice(2))}
        </h3>,
      );
    else if (line.startsWith("## "))
      blocks.push(
        <h4 key={index} className="font-semibold">
          {inline(line.slice(3))}
        </h4>,
      );
    else if (line.trim()) blocks.push(<p key={index}>{inline(line)}</p>);
    index++;
  }
  return <div className="space-y-3 text-sm leading-relaxed">{blocks}</div>;
}
