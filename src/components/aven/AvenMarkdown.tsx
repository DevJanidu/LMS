"use client";
import { Fragment, memo, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import AvenCopyButton from "./AvenCopyButton";
import { parseMarkdown, type Block } from "./markdown";
const internalLink = /^\/(resources|goals|calendar|study)([/?#]|$)/;
function inline(text: string): ReactNode {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\)|\*[^*\s][^*]*\*|\n)/g)
    .map((part, index) => {
      if (part === "\n") return <br key={index} />;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
        return <code key={index}>{part.slice(1, -1)}</code>;
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
          <a
            key={index}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer"
          >
            {link[1]}
          </a>
        );
      return <Fragment key={index}>{part}</Fragment>;
    });
}
const MarkdownBlock = memo(
  function MarkdownBlock({ block }: { block: Block }) {
    switch (block.kind) {
      case "code":
        return (
          <div className="aven-code">
            <div className="aven-code-bar">
              <span>{block.language || "text"}</span>
              <AvenCopyButton text={block.text} />
            </div>
            <pre>
              <code>{block.text}</code>
            </pre>
          </div>
        );
      case "heading":
        return block.level <= 2 ? (
          <h3>{inline(block.text)}</h3>
        ) : (
          <h4>{inline(block.text)}</h4>
        );
      case "list": {
        const List = block.ordered ? "ol" : "ul";
        return (
          <List>
            {block.items.map((item, index) => (
              <li key={index}>{inline(item)}</li>
            ))}
          </List>
        );
      }
      case "table":
        return (
          <div className="aven-table">
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, index) => (
                    <th key={index} scope="col">
                      {inline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, index) => (
                      <td key={index}>{inline(cell)}</td>
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
  (previous, next) => previous.block.raw === next.block.raw,
);
export default function AvenMarkdown({ text }: { text: string }) {
  return (
    <div className="aven-prose">
      {parseMarkdown(text).map((block, index) => (
        <MarkdownBlock key={`${index}:${block.kind}`} block={block} />
      ))}
    </div>
  );
}
