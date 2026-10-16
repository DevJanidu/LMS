"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shiftDay } from "@/lib/analytics";
import { duration } from "@/lib/time";

interface Props {
  /** "2026-10" */
  month: string;
  today: string;
  totals: Record<string, number>;
  weekStartDay: 0 | 1;
  /** Minutes that make a study day (the streak rule). */
  thresholdMinutes: number;
}

/** Five study-intensity levels: none, under the study-day rule, then 30m, 1h and 2h+. */
function level(seconds: number, thresholdMinutes: number) {
  if (seconds <= 0) return 0;
  if (seconds < thresholdMinutes * 60) return 1;
  if (seconds < 1800) return 2;
  if (seconds < 7200) return 3;
  return 4;
}

/** Month heatmap; choosing a day shows its study total below the grid. */
export default function StudiedDaysCalendar({ month, today, totals, weekStartDay, thresholdMinutes }: Props) {
  const t = useTranslations("analytics");
  const s = useTranslations("studyflow");
  const locale = useLocale();
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() - weekStartDay + 7) % 7;
  const days: string[] = [];
  for (let day = first; day.startsWith(month); day = shiftDay(day, 1)) days.push(day);
  const [selected, setSelected] = useState<string | null>(null);
  const label = (day: string) => new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  const studied = days.filter(day => (totals[day] ?? 0) >= thresholdMinutes * 60).length;
  return (
    <div className="an-heatmap">
      <div className="an-heatmap-meta">
        <p className="an-heatmap-month">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T12:00:00Z`))}</p>
        <p className="an-muted tabular-nums">{t("studiedDaysCount", { count: studied })}</p>
      </div>
      <div className="an-heatmap-grid" role="group" aria-label={t("heatmapLabel")}>
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} aria-hidden="true" className="an-heatmap-weekday">{s(`weekdaysShort.d${(weekStartDay + index) % 7}`)}</span>
          ))}
          {Array.from({ length: offset }, (_, index) => <span key={`pad-${index}`} aria-hidden="true" />)}
          {days.map(day => {
            const seconds = totals[day] ?? 0;
            return (
              <button key={day} type="button" className="an-heatmap-day" data-level={level(seconds, thresholdMinutes)}
                data-today={day === today || undefined} data-future={day > today || undefined} aria-pressed={selected === day}
                aria-label={t("dayTotal", { day: label(day), total: duration(seconds) })} onClick={() => setSelected(current => current === day ? null : day)}>
                {Number(day.slice(-2))}
              </button>
            );
          })}
      </div>
      <div className="an-heatmap-foot">
        <p className="an-heatmap-detail" aria-live="polite">
          {selected ? <><strong>{label(selected)}</strong> · <span className="tabular-nums">{duration(totals[selected] ?? 0)}</span></> : t("heatmapHint")}
        </p>
        <span className="an-legend" aria-hidden="true">
          {t("less")}{[0, 1, 2, 3, 4].map(value => <span key={value} className="an-heatmap-swatch" data-level={value} />)}{t("more")}
        </span>
      </div>
    </div>
  );
}
