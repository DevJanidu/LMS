import type { ReactNode } from "react";
interface Props {
  headingLevel?: 1 | 2;
  title: string;
  description?: string;
  action?: ReactNode;
}
/** Friendly guidance for empty collections and filtered results. */
export default function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
}: Props) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <div className="sf-empty px-6 py-12 text-center">
      <div aria-hidden="true" className="sf-empty-mark"><span /><span /><span /></div>
      <Heading className="text-lg font-medium text-gray-800 dark:text-white">
        {title}
      </Heading>
      {description && (
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}
      <div className="mt-5">{action}</div>
    </div>
  );
}
