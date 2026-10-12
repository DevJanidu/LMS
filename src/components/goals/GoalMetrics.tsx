"use client";
import { useTranslations } from "next-intl";
interface Props {
  statistics: {
    active: number;
    completed: number;
    tasksCompleted: number;
    upcoming: number;
  };
}
export default function GoalMetrics({ statistics }: Props) {
  const t = useTranslations("goals");
  return (
    <dl className="goal-metrics">
      {(["active", "completed", "tasksCompleted", "upcoming"] as const).map(
        (key) => (
          <div key={key}>
            <dt>{t(`summary.${key}`)}</dt>
            <dd>{Number(statistics[key] ?? 0).toLocaleString("en")}</dd>
            {key === "upcoming" && <p>{t("workspace.nextSevenDays")}</p>}
          </div>
        ),
      )}
    </dl>
  );
}
