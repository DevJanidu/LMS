import type { ReactNode } from "react";
import { CheckIcon } from "@/icons";

interface Props {
  index: number;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  flip?: boolean;
  action?: ReactNode;
  /** Product visual; wrapped in a neutral stage. */
  children: ReactNode;
}

/** One alternating product showcase row: copy on one side, product visual on the other. */
export default function FeatureRow({ index, eyebrow, title, description, points, flip = false, action, children }: Props) {
  return (
    <article className="mk-feature" data-flip={flip}>
      <div className="max-w-lg">
        <p className="mk-eyebrow"><span className="mk-feature-index">{String(index).padStart(2, "0")}</span>{eyebrow}</p>
        <h3 className="mk-subtitle mt-3">{title}</h3>
        <p className="mk-copy mt-4">{description}</p>
        <ul className="mk-checks mt-6">
          {points.map((point) => (
            <li key={point}><CheckIcon aria-hidden="true" />{point}</li>
          ))}
        </ul>
        {action && <div className="mt-7">{action}</div>}
      </div>
      <div className="mk-stage">{children}</div>
    </article>
  );
}
