import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, TargetIcon } from "@/icons";

interface Milestone {
  title: string;
  progress: number;
  tasks: { title: string; done: boolean }[];
}

/** Goal → milestones → tasks, as shown in the Goals workspace. */
export default function GoalsPreview() {
  const t = useTranslations("marketing.preview.goals");
  const milestones = t.raw("milestones") as Milestone[];
  return (
    <div className="mk-panel p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-950 dark:text-brand-300">
          <TargetIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body-strong">{t("goal")}</p>
          <p className="mk-muted">{t("due")}</p>
        </div>
        <span className="mk-ring" style={{ "--value": 38 } as CSSProperties} data-label="38%" />
      </div>
      <div className="mk-tree mt-4">
        {milestones.map((milestone, index) => (
          <div key={milestone.title} className="mk-card mk-card-pad">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{milestone.title}</p>
              <span className={`mk-chip ${milestone.progress === 100 ? "mk-chip-success" : index === 1 ? "mk-chip-brand" : ""}`}>
                {milestone.progress === 100 ? t("complete") : index === 1 ? t("inProgress") : t("upcoming")}
              </span>
            </div>
            <div className="mk-bar mt-2"><i style={{ width: `${milestone.progress}%` }} /></div>
            {milestone.tasks.length > 0 && (
              <ul className="mt-3 grid gap-1.5">
                {milestone.tasks.map((task) => (
                  <li key={task.title} className={`flex items-center gap-2 ${task.done ? "mk-muted line-through" : ""}`}>
                    <span className="mk-check" data-done={task.done}>{task.done && <CheckIcon />}</span>
                    {task.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
