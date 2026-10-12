import { useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SparklesIcon } from "@/icons";
import type { NextAction, NextActionReason } from "@/lib/goals/next-action";
interface Props {
  actions: NextAction[];
  /** Hide the goal name when the card sits on that goal's own page. */
  showGoal?: boolean;
  askAven?: boolean;
}
const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
/** Works in server and client components: it only renders verified ranking output. */
export default function NextBestActionCard({
  actions,
  showGoal = true,
  askAven = true,
}: Props) {
  const t = useTranslations("goals.nextBestAction"),
    headingId = useId();
  const reason = (item: NextActionReason) => {
    switch (item.code) {
      case "overdue":
      case "dueSoon":
        return t(`reasons.${item.code}`, { date: formatDay(item.date) });
      case "unblocks":
        return t("reasons.unblocks", {
          titles: item.titles.join(", "),
          count: item.count,
        });
      case "fitsToday":
        return t("reasons.fitsToday", { minutes: item.minutes });
      default:
        return t(`reasons.${item.code}`);
    }
  };
  if (!actions.length) return null;
  const [first, ...rest] = actions;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-brand-200 bg-brand-25 p-5 dark:border-brand-800 dark:bg-brand-950/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            id={headingId}
            className="text-overline text-brand-600 dark:text-brand-300"
          >
            {t("title")}
          </p>
          <p className="text-primary dark:text-primary mt-1 text-h3">
            {t("headline", { task: first.taskTitle })}
          </p>
          <p className="text-secondary dark:text-secondary mt-1 text-small">
            {first.reasons.slice(0, 3).map(reason).join(" ")}
          </p>
          <p className="text-muted dark:text-muted mt-2 text-caption">
            {[
              showGoal ? first.goalTitle : null,
              first.milestoneTitle,
              t("estimate", { minutes: first.remainingMinutes }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/goals/${first.goalId}`}
            className="text-small text-brand-600 dark:text-brand-300"
          >
            {t("openGoal")}
          </Link>
          {askAven && (
            <Link
              href="/aven?intent=nextAction"
              className="inline-flex items-center gap-1 text-small text-brand-600 dark:text-brand-300"
            >
              <SparklesIcon className="size-4" />
              {t("askAven")}
            </Link>
          )}
        </div>
      </div>
      {rest.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-brand-100 pt-3 dark:border-brand-900">
          {rest.map((action) => (
            <li
              key={action.taskId}
              className="text-secondary dark:text-secondary flex flex-wrap justify-between gap-2 text-small"
            >
              <Link
                href={`/goals/${action.goalId}`}
                className="text-primary dark:text-primary hover:text-brand-600 dark:hover:text-brand-300"
              >
                {action.taskTitle}
              </Link>
              <span className="text-muted dark:text-muted text-caption">
                {showGoal ? `${action.goalTitle} · ` : ""}
                {action.reasons[0] ? reason(action.reasons[0]) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
