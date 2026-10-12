import { useTranslations } from "next-intl";

const HOURS = [1.5, 2, 0.75, 2.5, 1.75, 3, 1.25];

/** Analytics: weekly study rhythm, streak and topic completion. */
export default function AnalyticsPreview() {
  const t = useTranslations("marketing.preview.analytics");
  const days = t.raw("days") as string[];
  const max = Math.max(...HOURS);
  return (
    <div className="mk-panel p-4">
      <div className="grid grid-cols-3 gap-3">
        {(["studyTime", "streak", "topics"] as const).map((key) => (
          <div key={key} className="mk-card mk-card-pad">
            <p className="mk-muted">{t(`${key}.label`)}</p>
            <p className="mk-stat mt-1">{t(`${key}.value`)}</p>
            <p className="mt-0.5 text-success-600 dark:text-success-400">{t(`${key}.delta`)}</p>
          </div>
        ))}
      </div>
      <div className="mk-card mk-card-pad mt-3">
        <div className="flex items-center justify-between">
          <p className="text-body-strong">{t("weekly")}</p>
          <span className="mk-chip">{t("range")}</span>
        </div>
        <div className="mk-bars mt-4">
          {HOURS.map((hours, index) => (
            <i key={index} data-peak={hours === max} style={{ height: `${(hours / max) * 100}%` }} />
          ))}
        </div>
        <div className="mk-week mt-2">
          {days.map((day, index) => <span key={index} className="mk-muted">{day}</span>)}
        </div>
      </div>
    </div>
  );
}
