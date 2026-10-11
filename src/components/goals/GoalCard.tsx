"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EditIcon, TrashIcon, CheckIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import type { GoalDetail } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  onEdit: () => void;
  onDelete: () => void;
  onComplete: () => void;
  busy?: boolean;
}
export default function GoalCard({
  detail,
  onEdit,
  onDelete,
  onComplete,
  busy,
}: Props) {
  const t = useTranslations("goals"),
    locale = useLocale(),
    { goal, progress } = detail,
    completed = goal.status === "completed";
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-700 dark:bg-gray-dark">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={"/goals/" + goal.id}
          className="text-primary dark:text-primary min-w-0 text-h3 break-words hover:text-brand-600 dark:hover:text-brand-300"
        >
          {goal.title}
        </Link>
        <span className="shrink-0 rounded-lg bg-brand-50 px-2 py-1 text-caption text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          {t(completed ? "statuses.completed" : "openGoalStatus")}
        </span>
      </div>
      <p className="text-secondary dark:text-secondary text-small">
        {t("targetLabel", {
          date: new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeZone: "UTC",
          }).format(new Date(goal.targetDate + "T12:00:00Z")),
        })}
      </p>
      {!completed && progress.daysRemaining < 0 && (
        <p className="text-caption text-warning-700 dark:text-warning-300">
          {t("overdueDays", { count: Math.abs(progress.daysRemaining) })}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <Button
          variant="outline"
          disabled={busy}
          onClick={onComplete}
          startIcon={completed ? <CheckIcon className="size-4" /> : undefined}
        >
          {t(completed ? "reopenGoal" : "markComplete")}
        </Button>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={onEdit}
            aria-label={t("editNamed", { title: goal.title })}
            className="text-secondary dark:text-secondary grid size-11 place-items-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <EditIcon className="size-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            aria-label={t("deleteNamed", { title: goal.title })}
            className="grid size-11 place-items-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-950/40"
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>
      <Link
        href={"/aven?goal=" + goal.id}
        className="text-small text-brand-600 dark:text-brand-300"
      >
        {t("askAven")}
      </Link>
    </article>
  );
}
