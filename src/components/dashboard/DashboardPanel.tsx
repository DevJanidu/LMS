import { useId, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
interface Props {
  title: string;
  action?: { href: string; label: string };
  children: ReactNode;
}
/** Shared shell for dashboard panels: one heading style, padding, radius and link treatment. */
export default function DashboardPanel({ title, action, children }: Props) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="sf-panel-card">
      <header className="sf-panel-card-head">
        <h2 id={id}>{title}</h2>
        {action && (
          <Link href={action.href} className="sf-panel-link">
            {action.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
export function PanelEmpty({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="sf-panel-empty">
      <p>{message}</p>
      {action}
    </div>
  );
}
/** Placeholder with the same footprint as a loaded panel, so content does not jump. */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="sf-panel-card">
      <div className="sf-skeleton h-5 w-36" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="space-y-2">
            <div className="sf-skeleton h-4 w-4/5" />
            <div className="sf-skeleton h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
