"use client";
import type { ReactNode } from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import { rankNextActions } from "@/lib/goals/next-action";
import { localDay } from "@/lib/analytics";
import NextBestActionCard from "./NextBestActionCard";
interface Props {
  detail: GoalDetail;
  references: GoalReferences;
  busy: boolean;
  taskList: ReactNode;
  milestoneList: ReactNode;
  onTasks: () => void;
  onMilestones: () => void;
}
export default function GoalOverview({
  detail,
  references,
  taskList,
  milestoneList,
  onTasks,
  onMilestones,
}: Props) {
  const t = useTranslations("goals");
  const [now] = useState(() => Date.now());
  const actions = rankNextActions([detail], {
    today: localDay(now, references.timezone),
    now,
    dailyTargetMinutes: 0,
  }).slice(0, 1);
  return (
    <>
      {(detail.goal.description ||
        detail.goal.successCriteria ||
        detail.goal.motivation) && (
        <section className="goal-panel goal-summary">
          <h2>{t("overview")}</h2>
          {detail.goal.description && (
            <>
              <p className="goal-description">
                {detail.goal.description.slice(0, 220)}
                {detail.goal.description.length > 220 && "…"}
              </p>
              {detail.goal.description.length > 220 && (
                <details>
                  <summary>{t("workspace.readMore")}</summary>
                  <p className="goal-description">
                    {detail.goal.description.slice(220)}
                  </p>
                </details>
              )}
            </>
          )}
          {detail.goal.successCriteria && (
            <details>
              <summary>{t("fields.successCriteria")}</summary>
              <p className="goal-description">{detail.goal.successCriteria}</p>
            </details>
          )}
          {detail.goal.motivation && (
            <details>
              <summary>{t("fields.motivation")}</summary>
              <p className="goal-description">{detail.goal.motivation}</p>
            </details>
          )}
          {detail.goal.progressMode === "outcome" && (
            <p className="goal-meta">{t("outcomeHelp")}</p>
          )}
        </section>
      )}
      {actions.length > 0 && (
        <NextBestActionCard
          actions={actions}
          showGoal={false}
          openGoal={false}
        />
      )}
      <section className="goal-panel">
        <div className="goal-section-heading">
          <h2>{t("workspace.upNext")}</h2>
          <button onClick={onTasks} className="goal-text-action">
            {t("workspace.viewTasks")}
          </button>
        </div>
        {taskList}
      </section>
      <section className="goal-panel">
        <div className="goal-section-heading">
          <h2>{t("workspace.milestoneSnapshot")}</h2>
          <button onClick={onMilestones} className="goal-text-action">
            {t("workspace.viewMilestones")}
          </button>
        </div>
        {milestoneList}
      </section>
      {(detail.calendar?.length ?? 0) > 0 && (
        <div className="goal-upcoming">
          <div>
            <p className="goal-meta">{t("workspace.nextSession")}</p>
            <strong>{detail.calendar![0].title}</strong>
            <p className="goal-meta">
              {new Date(detail.calendar![0].startsAt).toLocaleString("en", {
                timeZone: references.timezone,
              })}
            </p>
          </div>
          <Link href="/calendar" className="goal-text-action">
            {t("openPlanner")}
          </Link>
        </div>
      )}
    </>
  );
}
