import type { ReactNode } from "react";

interface Props {
  id: string;
  title: string;
  description?: string;
  /** Control in the header's end corner, e.g. a period filter. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** A dashboard panel: title, optional one-line description and action, then content. */
export default function AnalyticsCard({ id, title, description, action, className = "", children }: Props) {
  return (
    <section className={`an-card ${className}`} aria-labelledby={`${id}-title`}>
      <header className="an-card-head">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="an-card-title">{title}</h2>
          {description && <p className="an-card-desc">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
