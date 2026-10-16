"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { compactDuration } from "@/lib/time";
import { COMPETITION_TIMEZONE } from "@/lib/circles/policy";
import { CheckIcon, InfoIcon, TrophyIcon } from "@/icons";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import WeekPicker from "./WeekPicker";
import { useCircles } from "./useCircles";
import { PanelError, PanelSkeleton } from "./PanelState";
import type { History, Record } from "./types";

/** Every session that fed your score, what was excluded and why, and manual logs that never count. */
export default function HistoryPanel({ currentWeek }: { currentWeek: string }) {
  const t = useTranslations("circles.history");
  const format = useFormatter();
  const [week, setWeek] = useState(currentWeek);
  const history = useCircles<History>({ view: "history", week });
  const record = useCircles<Record>({ view: "record" });
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "numeric", minute: "2-digit", timeZone: COMPETITION_TIMEZONE });
  const day = (iso: string) => format.dateTime(new Date(iso), { weekday: "short", month: "short", day: "numeric", timeZone: COMPETITION_TIMEZONE });
  return (
    <div className="sc-stack">
      <AnalyticsCard id="circles-history" title={t("title")} description={t("description", { timezone: COMPETITION_TIMEZONE })} action={<WeekPicker week={week} current={currentWeek} onChange={setWeek} />}>
        {history.loading && !history.data ? <PanelSkeleton rows={4} />
          : history.error || !history.data ? <PanelError code={history.error} onRetry={history.reload} />
          : (
            <>
              <p className="sc-total"><span>{t("total")}</span><strong className="tabular-nums">{compactDuration(history.data.totalCreditedSeconds)}</strong></p>
              {history.data.sessions.length ? (
                <div className="sc-table-wrap">
                  <table className="sc-table sc-history">
                    <caption className="sr-only">{t("title")}</caption>
                    <thead><tr>
                      <th scope="col">{t("when")}</th><th scope="col">{t("subject")}</th>
                      <th scope="col" className="sc-col-num sc-hide-sm">{t("paused")}</th><th scope="col" className="sc-col-num">{t("credited")}</th><th scope="col">{t("status")}</th>
                    </tr></thead>
                    <tbody>
                      {history.data.sessions.map(session => (
                        <tr key={session.startedAt}>
                          <td><span className="sc-person-name">{day(session.startedAt)}</span><span className="sc-muted">{time(session.startedAt)} – {time(session.endedAt)}</span></td>
                          <td>{session.subject ?? t("deletedSubject")}</td>
                          <td className="sc-col-num sc-hide-sm tabular-nums sc-muted">{compactDuration(session.pausedSeconds)}</td>
                          <td className="sc-col-num tabular-nums">{compactDuration(session.creditedSeconds)}</td>
                          <td>
                            {session.invalidated ? <span className="sc-chip" data-tone="danger">{t("invalidated")}</span>
                              : session.excludedSeconds > 0 ? <span className="sc-chip" data-tone="warning" title={session.reasons.map(reason => t(`reasons.${reason}`)).join(" ")}>{t("partly", { time: compactDuration(session.excludedSeconds) })}</span>
                              : <span className="sc-chip" data-tone="success"><CheckIcon aria-hidden="true" />{t("counted")}</span>}
                            {session.reasons.length > 0 && <span className="sr-only">{session.reasons.map(reason => t(`reasons.${reason}`)).join(" ")}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="sc-empty">{t("noSessions")}</p>}
              {history.data.manual.length > 0 && (
                <div className="sc-manual">
                  <p className="sc-manual-title"><InfoIcon aria-hidden="true" />{t("manualTitle")}</p>
                  <ul className="sc-list">
                    {history.data.manual.map(entry => (
                      <li key={entry.id} className="sc-row"><span className="sc-row-main"><span>{entry.subject}</span><span className="sc-muted">{day(entry.startedAt)} · {compactDuration(entry.seconds)}</span></span><span className="sc-chip">{t("notCounted")}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
      </AnalyticsCard>
      <AnalyticsCard id="circles-record" title={t("recordTitle")} description={t("recordDescription")}>
        {record.loading && !record.data ? <PanelSkeleton rows={3} />
          : record.error || !record.data ? <PanelError code={record.error} onRetry={record.reload} />
          : (
            <>
              <dl className="sc-record">
                <div><dt>{t("bestWeek")}</dt><dd className="tabular-nums">{record.data.bestWeek ? compactDuration(record.data.bestWeek.seconds) : "—"}</dd></div>
                <div><dt>{t("groupWins")}</dt><dd className="tabular-nums"><TrophyIcon aria-hidden="true" />{record.data.groupWins}</dd></div>
                <div><dt>{t("weeksTracked")}</dt><dd className="tabular-nums">{record.data.weeks.filter(row => row.seconds > 0).length}</dd></div>
              </dl>
              {record.data.weeks.length > 0 && (
                <ol className="sc-weeks" aria-label={t("recentWeeks")}>
                  {[...record.data.weeks].reverse().map(row => {
                    const best = record.data!.bestWeek?.seconds ?? 0;
                    return (
                      <li key={row.week} title={`${row.week}: ${compactDuration(row.seconds)}`}>
                        <span className="sc-week-bar" style={{ blockSize: `${best ? Math.max(4, Math.round((row.seconds / best) * 100)) : 4}%` }} data-best={row.seconds === best && best > 0 || undefined} />
                        <span className="sc-week-tick">{format.dateTime(new Date(`${row.week}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" })}</span>
                        <span className="sr-only">{compactDuration(row.seconds)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
      </AnalyticsCard>
    </div>
  );
}
