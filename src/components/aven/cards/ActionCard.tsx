import type { ReactNode } from "react";
interface Props {
  eyebrow: string;
  title: ReactNode;
  status?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}
/** Shared shell for structured, backend-validated Aven cards. */
export default function ActionCard({
  eyebrow,
  title,
  status,
  children,
  footer,
}: Props) {
  return (
    <article className="aven-card">
      <header className="aven-card-header">
        <div className="min-w-0">
          <p className="aven-card-eyebrow">{eyebrow}</p>
          <h3 className="aven-card-title">{title}</h3>
        </div>
        {status}
      </header>
      <div className="aven-card-body">{children}</div>
      {footer && <footer className="aven-card-footer">{footer}</footer>}
    </article>
  );
}
export function CardFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="aven-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
