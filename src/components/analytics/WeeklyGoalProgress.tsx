import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { duration } from "@/lib/time";

interface Props { seconds: number; targetMinutes: number }

/** This week's study time against the weekly goal set in Settings. */
export default function WeeklyGoalProgress({ seconds, targetMinutes }: Props) {
  const t = useTranslations("analytics");
  if (targetMinutes <= 0) {
    return (
      <div className="an-goal">
        <p className="an-goal-value tabular-nums">{duration(seconds)}</p>
        <p className="an-muted">{t("noGoal")} <Link href="/settings#settings-preferences" className="an-link">{t("setGoal")}</Link></p>
      </div>
    );
  }
  const percent = Math.min(100, Math.round((seconds / 60 / targetMinutes) * 100));
  const remaining = Math.max(0, targetMinutes * 60 - seconds);
  return (
    <div className="an-goal">
      <p className="an-goal-value tabular-nums">{duration(seconds)} <span>{t("ofGoal", { goal: duration(targetMinutes * 60) })}</span></p>
      <span className="an-goal-track" role="progressbar" aria-label={t("weeklyGoal")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} data-complete={percent >= 100 || undefined}>
        <span style={{ inlineSize: `${percent}%` }} />
      </span>
      <p className="an-muted tabular-nums">{remaining ? t("toGo", { time: duration(remaining), percent }) : t("goalReached")}</p>
    </div>
  );
}
