"use client";
import { useTranslations, useLocale } from "next-intl";
import { TrashIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalMutation } from "@/lib/goals/validation";
interface Props {
  detail: GoalDetail;
  timezone: string;
  busy: boolean;
  onLog: (mode: "activity" | "session") => void;
  onDelete: (action: GoalMutation["action"]) => void;
}
export default function GoalActivityPanel({
  detail,
  timezone,
  busy,
  onLog,
  onDelete,
}: Props) {
  const t = useTranslations("goals"),
    locale = useLocale();
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: value.includes("T") ? timezone : "UTC",
    }).format(new Date(value.includes("T") ? value : `${value}T12:00:00Z`));
  return (
    <section className="goal-panel">
      <div className="goal-section-heading">
        <h2>{t("activity")}</h2>
        <div className="goal-actions">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onLog("activity")}
          >
            {t("addActivity")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onLog("session")}
          >
            {t("linkSession")}
          </Button>
        </div>
      </div>
      {detail.sessions.map((session) => (
        <div key={session.id} className="goal-activity-row">
          <p>
            {date(session.startedAt)} · {session.title} ·{" "}
            {t("trackedMinutes", {
              count: Math.round(session.allocatedSeconds / 60),
            })}
          </p>
          <button
            disabled={busy}
            className="goal-text-action goal-danger"
            onClick={() => onDelete({ kind: "unlinkSession", id: session.id })}
          >
            {t("unlink")}
          </button>
        </div>
      ))}
      {detail.activity.slice(0, 30).map((activity) => (
        <div key={activity.id} className="goal-activity-row">
          <div>
            <p>
              {t(`activityTypes.${activity.type}`)} · {activity.amount} ·{" "}
              {date(activity.date)}
            </p>
            <p className="goal-description">{activity.evidence}</p>
          </div>
          <button
            disabled={busy}
            className="goal-icon-action goal-danger"
            aria-label={t("deleteActivity")}
            onClick={() =>
              onDelete({ kind: "deleteActivity", id: activity.id })
            }
          >
            <TrashIcon className="size-4" />
          </button>
        </div>
      ))}
      {!detail.activity.length && !detail.sessions.length && (
        <p className="goal-empty-inline">{t("workspace.noActivity")}</p>
      )}
    </section>
  );
}
