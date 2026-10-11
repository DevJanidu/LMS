"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EditIcon, TrashIcon } from "@/icons";
import ProgressBar from "@/components/studyflow/ProgressBar";
import type { GoalDetail } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  onEdit: () => void;
  onDelete: () => void;
}
export default function GoalCard({ detail, onEdit, onDelete }: Props) {
  const t = useTranslations("goals"),
    locale = useLocale(),
    { goal, progress } = detail;
  const next = detail.tasks.find((task) => task.id === progress.nextTaskId);
  const milestone = detail.milestones.find(
    (m) => progress.milestoneProgress[m.id] < 100,
  );
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-700 dark:bg-gray-dark">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted dark:text-muted text-overline">
            {goal.category === "custom"
              ? goal.customCategory || t("categories.custom")
              : t(`categories.${goal.category}`)}
          </p>
          <Link
            href={`/goals/${goal.id}`}
            className="text-primary dark:text-primary mt-1 block text-h3 break-words hover:text-brand-600 dark:hover:text-brand-300"
          >
            {goal.title}
          </Link>
        </div>
        <span className="shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-caption text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          {t(`statuses.${goal.status}`)}
        </span>
      </div>
      <ProgressBar
        value={progress.percent}
        label={t("progressValue", { value: progress.percent })}
      />
      <div className="text-secondary dark:text-secondary flex justify-between gap-2 text-small">
        <span>{t("progressValue", { value: progress.percent })}</span>
        <span>{t(`health.${progress.health}`)}</span>
      </div>
      <div className="text-secondary dark:text-secondary flex-1 space-y-2 text-small">
        {milestone && (
          <p>{t("currentMilestone", { title: milestone.title })}</p>
        )}
        <p>{next ? t("nextAction", { title: next.title }) : t("noNextTask")}</p>
        <p>
          {t("targetLabel", {
            date: new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(`${goal.targetDate}T12:00:00Z`)),
          })}{" "}
          ·{" "}
          {t(progress.daysRemaining < 0 ? "overdueDays" : "daysRemaining", {
            count: Math.abs(progress.daysRemaining),
          })}
        </p>
      </div>
      <div className="flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
        <Link
          href={`/aven?goal=${goal.id}`}
          className="text-small text-brand-600 dark:text-brand-300"
        >
          {t("askAven")}
        </Link>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("editNamed", { title: goal.title })}
            title={t("editGoal")}
            className="text-secondary dark:text-secondary grid size-11 place-items-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <EditIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("deleteNamed", { title: goal.title })}
            title={t("deleteGoal")}
            className="grid size-11 place-items-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-950/40"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
