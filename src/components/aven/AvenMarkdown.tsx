import { Fragment, type ReactNode } from "react";
function inline(text: string): ReactNode {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`") && part.endsWith("`"))
        return (
          <code
            key={index}
            className="rounded bg-gray-100 px-1 text-small dark:bg-gray-800"
          >
            {part.slice(1, -1)}
          </code>
        );
      const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (
        match &&
        (/^https?:\/\//i.test(match[2]) ||
          /^\/(resources|goals|calendar|study)([/?]|$)/.test(match[2]))
      )
        return (
          <a
            key={index}
            href={match[2]}
            target={match[2].startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="break-words text-brand-600 underline dark:text-brand-300"
          >
            {match[1]}
          </a>
        );
      return <Fragment key={index}>{part}</Fragment>;
    });
}
export default function AvenMarkdown({ text }: { text: string }) {
  return (
    <div className="text-primary dark:text-primary space-y-3 text-body break-words">
      {text.split(/```/g).map((block, index) =>
        index % 2 ? (
          <pre
            key={index}
            className="max-w-full overflow-x-auto rounded-xl bg-gray-100 p-3 text-small dark:bg-gray-900"
          >
            <code>{block.replace(/^\w*\n/, "")}</code>
          </pre>
        ) : (
          <div key={index} className="space-y-2">
            {block
              .split(/\r?\n/)
              .filter((line) => line.trim())
              .map((line, i) =>
                /^#{1,3} /.test(line) ? (
                  <h3 key={i} className="text-h3">
                    {inline(line.replace(/^#{1,3} /, ""))}
                  </h3>
                ) : /^[-*] /.test(line) ? (
                  <p key={i} className="ps-3">
                    • {inline(line.slice(2))}
                  </p>
                ) : (
                  <p key={i}>{inline(line)}</p>
                ),
              )}
          </div>
        ),
      )}
    </div>
  );
}
