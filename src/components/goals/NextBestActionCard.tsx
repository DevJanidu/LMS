import { useId } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, StartPlayIcon } from "@/icons";
import type { NextAction, NextActionReason } from "@/lib/goals/next-action";
import AskAvenMenu from "./AskAvenMenu";
interface Props {
  actions: NextAction[];
  /** Hide the goal name when the card sits on that goal's own page. */
  showGoal?: boolean;
  /** Offer the Aven menu (off inside Aven itself). */
  askAven?: boolean;
}
const formatDay = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
const studyHref = (action: NextAction) => {
  const params = new URLSearchParams();
  if (action.subjectId) params.set("subject", action.subjectId);
  if (action.topicId) params.set("topic", action.topicId);
  const query = params.toString();
  return `/study${query ? `?${query}` : ""}`;
};
/** The recommended next task from the deterministic ranking engine; works in server and client trees. */
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
    <section aria-labelledby={headingId} className="sf-nba">
      <div className="sf-nba-body">
        <p className="sf-nba-eyebrow">{t("title")}</p>
        <h2 id={headingId} className="sf-nba-title">
          {first.taskTitle}
        </h2>
        <p className="sf-nba-why">
          {[
            showGoal ? t("towardGoal", { goal: first.goalTitle }) : null,
            ...first.reasons.slice(0, 2).map(reason),
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
        <p className="sf-nba-meta">
          {[
            first.milestoneTitle,
            first.remainingMinutes
              ? t("estimate", { minutes: first.remainingMinutes })
              : null,
            t("due", { date: formatDay(first.dueDate) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="sf-nba-actions">
        <Link href={studyHref(first)} className="sf-action-primary">
          <StartPlayIcon className="size-4" aria-hidden="true" />
          {t("start")}
        </Link>
        {askAven && (
          <AskAvenMenu goalId={first.goalId} task={first.taskTitle} />
        )}
        <Link href={`/goals/${first.goalId}`} className="sf-action-ghost">
          {t("openGoal")}
          <ArrowRightIcon
            className="size-4 rtl:rotate-180"
            aria-hidden="true"
          />
        </Link>
      </div>
      {rest.length > 0 && (
        <div className="sf-nba-more">
          <p className="sf-nba-more-label">{t("alsoConsider")}</p>
          <ul>
            {rest.map((action) => (
              <li key={action.taskId}>
                <Link href={`/goals/${action.goalId}`}>
                  <span className="sf-nba-more-title">{action.taskTitle}</span>
                  <span className="sf-nba-more-meta">
                    {showGoal ? action.goalTitle : action.milestoneTitle}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
