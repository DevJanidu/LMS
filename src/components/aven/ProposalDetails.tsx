"use client";
import { useTranslations } from "next-intl";
import type { AvenProposal } from "@/lib/aven/validation";
import type { GoalReferences } from "@/lib/goals/service";
export default function ProposalDetails({
  value,
  date,
  references,
}: {
  value: AvenProposal;
  date: (value: string) => string;
  references: GoalReferences;
}) {
  const t = useTranslations("aven");
  return (
    <div className="text-secondary dark:text-secondary space-y-3 text-small">
      {value.kind === "calendarChanges" &&
        value.changes.map((change, index) => (
          <div
            key={index}
            className="rounded-lg border border-brand-100 p-3 dark:border-brand-900"
          >
            <p className="text-primary dark:text-primary font-medium">
              {change.title ?? change.date}
            </p>
            {change.action === "move" ? (
              <>
                {change.previousStartsAt && change.previousEndsAt && (
                  <p>
                    {t("previousTime", {
                      start: date(change.previousStartsAt),
                      end: date(change.previousEndsAt),
                    })}
                  </p>
                )}
                <p>
                  {t("newTime", {
                    start: date(change.startsAt),
                    end: date(change.endsAt),
                  })}
                </p>
              </>
            ) : (
              <p>{t(`cancelScope.${change.scope}`, { date: change.date })}</p>
            )}
          </div>
        ))}
      {value.kind === "calendarCreate" && (
        <>
          <p className="text-primary dark:text-primary font-medium">
            {value.title}
          </p>
          <p>
            {date(value.startsAt)} → {date(value.endsAt)}
          </p>
          <p>{t(value.repeat === "weekly" ? "recursWeekly" : "oneTime")}</p>
          {value.repeat === "weekly" && (
            <>
              <p>
                {value.weekdays.map((day) => t(`weekdays.${day}`)).join(", ")}
              </p>
              <p>
                {value.until
                  ? t("recursUntil", { date: value.until })
                  : t("recursOngoing")}
              </p>
            </>
          )}
        </>
      )}
      {value.kind === "goalCompletion" && (
        <p>
          {t(value.completed ? "completeGoalPreview" : "reopenGoalPreview", {
            title: value.title,
          })}
        </p>
      )}
      {value.kind === "milestoneCreate" && (
        <>
          <p>{value.value.title}</p>
          <p>{value.value.description}</p>
          <p>{value.value.dueDate}</p>
        </>
      )}
      {(value.kind === "studyPreferences" ||
        value.kind === "reminderPreferences") &&
        Object.entries(value.patch)
          .filter(([, item]) => item !== null)
          .map(([key, item]) => (
            <p key={key}>
              <span className="font-medium">{t(`settingsFields.${key}`)}:</span>{" "}
              {typeof item === "boolean"
                ? t(item ? "on" : "off")
                : Array.isArray(item)
                  ? item.map((day) => t(`weekdays.${day}`)).join(", ")
                  : String(item)}
            </p>
          ))}
      {value.kind === "resourceOrganization" && (
        <>
          <p>{value.title ?? t("keepResourceTitle")}</p>
          <p>
            {t("resourceMovePreview", {
              subject:
                references.subjects.find((item) => item.id === value.subjectId)
                  ?.title ?? t("subjectUnavailable"),
              topic: value.topicId
                ? (references.topics.find((item) => item.id === value.topicId)
                    ?.title ?? t("topicUnavailable"))
                : t("noTopic"),
            })}
          </p>
        </>
      )}
      {value.kind === "memory" && (
        <p className="whitespace-pre-wrap">{value.content}</p>
      )}
    </div>
  );
}
