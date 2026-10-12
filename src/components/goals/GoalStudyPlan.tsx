"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import type { GoalDetail } from "@/lib/goals/model";
interface Props {
  detail: GoalDetail;
  timezone: string;
}
export default function GoalStudyPlan({ detail, timezone }: Props) {
  const t = useTranslations("goals");
  const [now] = useState(() => Date.now());
  const sessions = (detail.calendar ?? []).filter(
    (item) => Date.parse(item.endsAt) > now,
  );
  const format = (value: string, time = false) =>
    new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      ...(time
        ? { timeStyle: "short" as const }
        : { dateStyle: "medium" as const }),
    }).format(new Date(value));
  return (
    <section className="goal-panel">
      <div className="goal-section-heading">
        <h2>{t("workspace.studyPlan")}</h2>
        <Link href="/calendar" className="goal-text-action">
          {t("openPlanner")}
        </Link>
      </div>
      {sessions.length ? (
        <ul className="goal-session-list">
          {sessions.map((item) => (
            <li key={`${item.blockId}:${item.occurrenceDate ?? item.startsAt}`}>
              <div>
                <strong>{item.title}</strong>
                <p className="goal-meta">
                  {format(item.startsAt)} · {format(item.startsAt, true)}–
                  {format(item.endsAt, true)}
                </p>
                <p className="goal-meta">
                  {[
                    item.subjectTitle,
                    detail.tasks.find((task) => task.id === item.taskId)?.title,
                    item.repeat === "weekly"
                      ? t("workspace.repeatsWeekly")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="goal-actions">
                <Link
                  href={`/study${(item.subjectId ?? detail.tasks.find((task) => task.id === item.taskId)?.subjectId) ? `?subject=${item.subjectId ?? detail.tasks.find((task) => task.id === item.taskId)?.subjectId}` : ""}`}
                  className="goal-text-action"
                >
                  {t("studyTask")}
                </Link>
                <Link
                  href={`/aven?goal=${detail.goal.id}&intent=schedule`}
                  className="goal-text-action"
                >
                  {t("workspace.reschedule")}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="goal-empty-inline">
          <p>{t("workspace.noSessions")}</p>
          <Link
            href={`/aven?goal=${detail.goal.id}&intent=schedule`}
            className="sf-action-secondary"
          >
            {t("workspace.planWithAven")}
          </Link>
        </div>
      )}
    </section>
  );
}
