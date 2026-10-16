import type { ReactNode } from "react";

interface Props {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  /** Optional status line or action shown under the description. */
  status?: ReactNode;
  children: ReactNode;
}

/** A settings section: icon tile, title, one-line description, hairline divider, then content. */
export default function SettingsCard({ id, icon, title, description, status, children }: Props) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="sf-set-card">
      <header className="sf-set-card-head">
        <span className="sf-set-icon" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="sf-set-title">{title}</h2>
          <p className="sf-set-desc">{description}</p>
          {status}
        </div>
      </header>
      <div className="sf-set-card-body">{children}</div>
    </section>
  );
}
