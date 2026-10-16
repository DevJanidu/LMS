import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  /** Short supporting line, e.g. "Best: 12 days". */
  hint?: string;
  tone?: "brand" | "warm" | "success";
}

/** One headline number with its icon and label. */
export default function KpiCard({ icon, label, value, hint, tone = "brand" }: Props) {
  return (
    <div className="an-kpi" data-tone={tone}>
      <span className="an-kpi-icon" aria-hidden="true">{icon}</span>
      <dl className="min-w-0">
        <dt className="an-kpi-label">{label}</dt>
        <dd className="an-kpi-value tabular-nums">{value}</dd>
        {hint && <dd className="an-kpi-hint">{hint}</dd>}
      </dl>
    </div>
  );
}
