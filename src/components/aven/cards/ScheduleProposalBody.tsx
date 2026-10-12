"use client";
import { useTranslations } from "next-intl";
import type { AvenProposal } from "@/lib/aven/validation";
import type { GoalReferences } from "@/lib/goals/service";
import { CardFact } from "./ActionCard";
import { formatDay, type ZonedFormatters } from "./formatters";
import DurationText from "./DurationText";
type Schedule = Extract<AvenProposal, { kind: "schedule" | "calendarCreate" }>;
interface Props {
  value: Schedule;
  references: GoalReferences;
  format: ZonedFormatters;
}
export default function ScheduleProposalBody({
  value,
  references,
  format,
}: Props) {
  const t = useTranslations("aven"),
    c = useTranslations("aven.cards");
  const subject = (id: string | null) =>
    id ? references.subjects.find((item) => item.id === id)?.title : undefined;
  if (value.kind === "calendarCreate") {
    const weekly = value.repeat === "weekly";
    return (
      <>
        <dl className="aven-facts">
          <CardFact label={c("subject")}>
            {subject(value.subjectId) ?? c("noSubject")}
          </CardFact>
          <CardFact label={c("startDate")}>
            {format.day(value.startsAt)}
          </CardFact>
          <CardFact label={c("endDate")}>
            {weekly
              ? value.until
                ? formatDay(value.until)
                : c("ongoing")
              : format.day(value.endsAt)}
          </CardFact>
          <CardFact label={c("startTime")}>
            {format.time(value.startsAt)}
          </CardFact>
          <CardFact label={c("endTime")}>{format.time(value.endsAt)}</CardFact>
          <CardFact label={c("recurrence")}>
            {weekly
              ? value.weekdays.length === 7
                ? c("daily")
                : c("weeklyOn", {
                    days: value.weekdays
                      .map((day) => t(`weekdays.${day}`))
                      .join(", "),
                  })
              : t("oneTime")}
          </CardFact>
          {value.occurrences !== undefined && (
            <CardFact label={c("sessions")}>
              {c("sessionCount", { count: value.occurrences })}
            </CardFact>
          )}
        </dl>
        {value.conflicts.length > 0 && (
          <section>
            <h4 className="aven-card-section">
              {c("skippedConflicts", { count: value.skipDates.length })}
            </h4>
            <ul className="aven-card-list">
              {value.conflicts.map((conflict) => (
                <li key={`${conflict.date}:${conflict.startsAt}`}>
                  <span>{format.day(conflict.startsAt)}</span>
                  <span className="aven-card-meta">
                    {c("conflictsWith", {
                      title: conflict.title,
                      start: format.time(conflict.startsAt),
                      end: format.time(conflict.endsAt),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="aven-card-note">{c("conflictCheck")}</p>
      </>
    );
  }
  const sessions = [...value.sessions].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  );
  const minutes = sessions.reduce(
    (sum, item) =>
      sum + (Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 60000,
    0,
  );
  const subjects = [
    ...new Set(sessions.map((item) => subject(item.subjectId)).filter(Boolean)),
  ];
  return (
    <>
      <dl className="aven-facts">
        <CardFact label={c("subject")}>
          {subjects.length ? subjects.join(", ") : c("noSubject")}
        </CardFact>
        <CardFact label={c("startDate")}>
          {format.day(sessions[0].startsAt)}
        </CardFact>
        <CardFact label={c("endDate")}>
          {format.day(sessions.at(-1)!.endsAt)}
        </CardFact>
        <CardFact label={c("recurrence")}>
          {c("sessionCount", { count: sessions.length })}
        </CardFact>
        <CardFact label={c("totalTime")}>
          <DurationText minutes={minutes} />
        </CardFact>
      </dl>
      <section>
        <h4 className="aven-card-section">{c("sessions")}</h4>
        <ul className="aven-card-list">
          {sessions.map((session, index) => (
            <li key={index}>
              <span>{session.title}</span>
              <span className="aven-card-meta">
                {format.day(session.startsAt)} · {format.time(session.startsAt)}
                {" – "}
                {format.time(session.endsAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <p className="aven-card-note">{c("conflictCheck")}</p>
    </>
  );
}
