import type { ReactNode } from "react";
interface Props {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  children?: ReactNode;
}
/** A compact statistic without decorative charts. */
export default function StatTile({ label, value, detail, children }: Props) {
  return (
    <div className="sf-stat p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-3 text-title-sm font-medium text-gray-900 dark:text-white">
        {value}
      </p>
      {detail && (
        <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">
          {detail}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
