import { getTranslations } from "next-intl/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { getGoalCards } from "@/lib/goals/service";
import { Link } from "@/i18n/navigation";
import ProgressBar from "@/components/studyflow/ProgressBar";
import { SparklesIcon } from "@/icons";
export default async function GoalPriorities({ userId }: { userId: string }) {
  const t = await getTranslations("goals");
  const details = await (async () => {
    const rows = await getDb()
      .select({ id: goals.id })
      .from(goals)
      .where(
        and(
          eq(goals.userId, userId),
          inArray(goals.status, ["active", "planned", "missedTarget"]),
        ),
      )
      .orderBy(asc(goals.targetDate))
      .limit(3);
    return getGoalCards(
      userId,
      rows.map((row) => row.id),
    );
  })().catch(() => undefined);
  if (!details)
    return (
      <Link
        href="/goals"
        className="my-6 inline-block text-small text-brand-600 dark:text-brand-300"
      >
        {t("title")}
      </Link>
    );
  return (
    <section className="my-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-dark">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-primary dark:text-primary text-h3">
          {t("dailyPriorities")}
        </h2>
        <Link
          href="/aven?intent=today"
          className="inline-flex items-center gap-2 text-small text-brand-600 dark:text-brand-300"
        >
          <SparklesIcon className="size-4" />
          {t("askAven")}
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {details.map((detail) => (
          <div key={detail.goal.id} className="space-y-2">
            <Link
              href={`/goals/${detail.goal.id}`}
              className="text-primary dark:text-primary text-h3 hover:text-brand-600 dark:hover:text-brand-300"
            >
              {detail.goal.title}
            </Link>
            <ProgressBar
              value={detail.progress.percent}
              label={detail.goal.title}
            />
            <p className="text-secondary dark:text-secondary text-small">
              {detail.tasks.find(
                (task) => task.id === detail.progress.nextTaskId,
              )?.title ?? t("noNextTask")}
            </p>
            <p className="text-muted dark:text-muted text-caption">
              {t("targetLabel", { date: detail.goal.targetDate })}
            </p>
          </div>
        ))}
      </div>
      {!details.length && (
        <Link
          href="/goals"
          className="text-small text-brand-600 dark:text-brand-300"
        >
          {t("createGoal")}
        </Link>
      )}
    </section>
  );
}
