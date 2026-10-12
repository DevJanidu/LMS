import type { ReactNode } from "react";

interface Props {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  center?: boolean;
  children?: ReactNode;
}

export default function SectionHeading({ id, eyebrow, title, description, center = false, children }: Props) {
  return (
    <div className={`mk-section-head ${center ? "mk-center" : ""}`}>
      {eyebrow && <p className="mk-eyebrow">{eyebrow}</p>}
      <h2 id={id} className="mk-title mt-3">{title}</h2>
      {description && <p className="mk-lead mt-4">{description}</p>}
      {children}
    </div>
  );
}
