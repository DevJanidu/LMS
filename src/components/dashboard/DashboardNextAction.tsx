import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SparklesIcon } from "@/icons";
import { getNextBestActions } from "@/lib/goals/next-action-server";
import NextBestActionCard from "@/components/goals/NextBestActionCard";
/** The dashboard centerpiece: the highest-ranked next task, or guidance when none exists. */
export default async function DashboardNextAction({
  userId,
}: {
  userId: string;
}) {
  const t = await getTranslations("goals.nextBestAction");
  const actions = await getNextBestActions(userId, { limit: 3 }).catch(
    () => null,
  );
  if (actions?.length) return <NextBestActionCard actions={actions} />;
  return (
    <section className="sf-nba" data-empty>
      <div className="sf-nba-body">
        <p className="sf-nba-eyebrow">{t("title")}</p>
        <h2 className="sf-nba-title">
          {t(actions ? "emptyTitle" : "unavailableTitle")}
        </h2>
        <p className="sf-nba-why">
          {t(actions ? "emptyHelp" : "unavailableHelp")}
        </p>
      </div>
      <div className="sf-nba-actions">
        <Link href="/goals" className="sf-action-primary">
          {t("createGoal")}
        </Link>
        <Link href="/aven?intent=nextAction" className="sf-action-secondary">
          <SparklesIcon className="size-4" aria-hidden="true" />
          {t("askAven")}
        </Link>
      </div>
    </section>
  );
}
export function NextActionSkeleton() {
  return (
    <div aria-busy="true" className="sf-nba">
      <div className="sf-nba-body">
        <div className="sf-skeleton h-3 w-28" />
        <div className="sf-skeleton mt-3 h-6 w-2/3" />
        <div className="sf-skeleton mt-3 h-4 w-1/2" />
      </div>
      <div className="sf-nba-actions">
        <div className="sf-skeleton h-10 w-36" />
        <div className="sf-skeleton h-10 w-28" />
      </div>
    </div>
  );
}
