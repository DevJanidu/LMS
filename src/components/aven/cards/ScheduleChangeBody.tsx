"use client";
import { useTranslations } from "next-intl";
import type { AvenProposal } from "@/lib/aven/validation";
import { formatDay, type ZonedFormatters } from "./formatters";
type Change = Extract<AvenProposal, { kind: "calendarChanges" | "reschedule" }>;
interface Props {
  value: Change;
  format: ZonedFormatters;
}
export default function ScheduleChangeBody({ value, format }: Props) {
  const t = useTranslations("aven"),
    c = useTranslations("aven.cards");
  const range = (start: string, end: string) =>
    `${format.day(start)} · ${format.time(start)} – ${format.time(end)}`;
  const changes =
    value.kind === "reschedule"
      ? [
          {
            action: "move" as const,
            scope: "one" as const,
            affected: undefined,
            title: undefined,
            date: value.date,
            previousStartsAt: undefined,
            previousEndsAt: undefined,
            startsAt: value.startsAt,
            endsAt: value.endsAt,
          },
        ]
      : value.changes;
  const cancels = changes.filter((item) => item.action === "cancel").length;
  return (
    <>
      <p className="aven-card-meta">
        {c("affectedOccurrences", {
          count: changes.reduce((sum, item) => sum + (item.affected ?? 1), 0),
        })}
      </p>
      <ul className="aven-change-list">
        {changes.map((change, index) => (
          <li key={index}>
            <p className="aven-change-title">
              {change.title ?? formatDay(change.date)}
            </p>
            {/* Series edits are labelled explicitly so a whole series is never changed silently. */}
            {change.action === "move" && (
              <p className="aven-card-meta" data-scope={change.scope}>
                {c(`scope.${change.scope}`)}
                {change.affected !== undefined &&
                  change.scope !== "one" &&
                  ` · ${c("affectedOccurrences", { count: change.affected })}`}
              </p>
            )}
            {change.action === "move" ? (
              <div className="aven-change-diff">
                <div>
                  <span className="aven-change-label">{c("existing")}</span>
                  <span data-previous>
                    {change.previousStartsAt && change.previousEndsAt
                      ? range(change.previousStartsAt, change.previousEndsAt)
                      : c("occurrenceOn", { date: formatDay(change.date) })}
                  </span>
                </div>
                <div>
                  <span className="aven-change-label">{c("proposed")}</span>
                  <span>{range(change.startsAt, change.endsAt)}</span>
                </div>
              </div>
            ) : (
              <p className="aven-card-text">
                {t(`cancelScope.${change.scope}`, {
                  date: formatDay(change.date),
                })}
              </p>
            )}
          </li>
        ))}
      </ul>
      {cancels > 0 && (
        <p className="aven-card-warning" role="note">
          {c("cancelWarning", { count: cancels })}
        </p>
      )}
      <p className="aven-card-note">{c("conflictCheck")}</p>
    </>
  );
}
