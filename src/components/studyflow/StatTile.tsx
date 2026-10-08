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
    <div className="sf-stat p-6">
      <p className="text-caption text-muted dark:text-secondary">{label}</p>
      <p className="mt-2 text-stat text-primary dark:text-primary">
        {value}
      </p>
      {detail && (
        <p className="mt-2 text-caption text-muted dark:text-secondary">
          {detail}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
