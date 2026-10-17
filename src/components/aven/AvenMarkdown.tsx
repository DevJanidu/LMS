"use client";
import { Fragment, memo, useMemo, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import AvenCopyButton from "./AvenCopyButton";
import {
  parseMarkdown,
  splitStable,
  streamingView,
  type Block,
  type ListItem,
} from "./markdown";
const internalLink = /^\/(resources|goals|calendar|study|subjects|analytics|circles)([/?#]|$)/;
const TOKEN =
  /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*[^*\s][^*]*\*|\$[^$\s][^$]*\$|\n)/g;
/**
 * Inline Markdown. Model output is untrusted: it only ever becomes text inside React
 * elements (React escapes it), and links are limited to Acadence routes and http(s).
 */
export function inline(text: string): ReactNode {
  return text.split(TOKEN).map((part, index) => {
    if (!part) return null;
    if (part === "\n") return <br key={index} />;
    if (
      (part.startsWith("**") && part.endsWith("**")) ||
      (part.startsWith("__") && part.endsWith("__"))
    )
      if (part.length > 4)
        return <strong key={index}>{inline(part.slice(2, -2))}</strong>;
    if (part.startsWith("~~") && part.endsWith("~~") && part.length > 4)
      return <del key={index}>{part.slice(2, -2)}</del>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2)
      return (
        <span key={index} className="aven-math">
          {part.slice(1, -1)}
        </span>
      );
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={index}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link && internalLink.test(link[2]))
      return (
        <Link key={index} href={link[2]}>
          {link[1]}
        </Link>
      );
    if (link && /^https?:\/\//i.test(link[2]))
      return (
        <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer nofollow">
          {link[1]}
        </a>
      );
    // Any other scheme (javascript:, data:, …) is shown as its label only.
    if (link) return <Fragment key={index}>{link[1]}</Fragment>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}
function Items({ items, ordered }: { items: ListItem[]; ordered: boolean }) {
  const List = ordered ? "ol" : "ul";
  const checklist = items.some((item) => item.checked !== null);
  return (
    <List data-checklist={checklist || undefined}>
      {items.map((item, index) => (
        <li key={index} data-checked={item.checked ?? undefined}>
          {item.checked !== null && (
            <input
              type="checkbox"
              checked={item.checked}
              readOnly
              disabled
              aria-label={item.text}
              className="aven-check"
            />
          )}
          <span>{inline(item.text)}</span>
          {item.children.length > 0 && (
            <Items items={item.children} ordered={item.children[0].ordered} />
          )}
        </li>
      ))}
    </List>
  );
}
const MarkdownBlock = memo(
  function MarkdownBlock({ block }: { block: Block }) {
    switch (block.kind) {
      case "code":
        return (
          <div className="aven-code" data-open={block.open || undefined}>
            <div className="aven-code-bar">
              <span>{block.language || "text"}</span>
              {!block.open && <AvenCopyButton text={block.text} />}
            </div>
            <pre>
              <code>{block.text}</code>
            </pre>
          </div>
        );
      case "math":
        return (
          <div className="aven-math-block" role="math" aria-label={block.text}>
            {block.text}
          </div>
        );
      case "heading":
        return block.level <= 2 ? (
          <h3>{inline(block.text)}</h3>
        ) : block.level === 3 ? (
          <h4>{inline(block.text)}</h4>
        ) : (
          <h5>{inline(block.text)}</h5>
        );
      case "list":
        return <Items items={block.items} ordered={block.ordered} />;
      case "table":
        return (
          <div className="aven-table">
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, index) => (
                    <th
                      key={index}
                      scope="col"
                      style={block.align[index] ? { textAlign: block.align[index]! } : undefined}
                    >
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, index) => (
                      <td
                        key={index}
                        style={block.align[index] ? { textAlign: block.align[index]! } : undefined}
                      >
                        {inline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case "quote":
        return <blockquote>{inline(block.text)}</blockquote>;
      case "rule":
        return <hr />;
      default:
        return <p>{inline(block.text)}</p>;
    }
  },
  // Completed blocks keep identical source while streaming, so only the trailing block re-renders.
  (previous, next) => previous.block.raw === next.block.raw && previous.block.kind === next.block.kind,
);
/**
 * While streaming, the stable prefix (up to the last paragraph break outside a fence) is
 * parsed once per change of that prefix; only the short tail is parsed on every frame.
 */
function AvenMarkdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const view = streaming ? streamingView(text) : text;
  const [prefix, tail] = useMemo(
    () => (streaming ? splitStable(view) : ["", view]),
    [view, streaming],
  );
  const stable = useMemo(() => parseMarkdown(prefix), [prefix]);
  const live = useMemo(() => parseMarkdown(tail), [tail]);
  return (
    <div className="aven-prose" data-streaming={streaming || undefined}>
      {[...stable, ...live].map((block, index) => (
        <MarkdownBlock key={`${index}:${block.kind}`} block={block} />
      ))}
    </div>
  );
}
export default memo(AvenMarkdown);
