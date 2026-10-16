import { useTranslations } from "next-intl";

interface Props { completed: number; total: number; thisMonth: number }

/** Ring of completed topics across active subjects (CSS conic gradient, no chart library). */
export default function TopicCompletion({ completed, total, thisMonth }: Props) {
  const t = useTranslations("analytics");
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="an-ring-wrap">
      <div className="an-ring" role="img" aria-label={t("topicsRingLabel", { completed, total, percent })} style={{ "--an-ring": `${percent}%` } as React.CSSProperties}>
        <span className="an-ring-value tabular-nums">{percent}%</span>
      </div>
      <dl className="an-ring-stats">
        <div><dt>{t("topicsDone")}</dt><dd className="tabular-nums">{t("ofTotal", { done: completed, total })}</dd></div>
        <div><dt>{t("topicsThisMonth")}</dt><dd className="tabular-nums">{thisMonth}</dd></div>
        <div><dt>{t("topicsLeft")}</dt><dd className="tabular-nums">{Math.max(0, total - completed)}</dd></div>
      </dl>
    </div>
  );
}
