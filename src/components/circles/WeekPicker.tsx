"use client";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/icons";
import { shiftDay } from "@/lib/analytics";

interface Props { week: string; current: string; onChange: (week: string) => void }

/** Step between competition weeks (Mondays); never into the future. */
export default function WeekPicker({ week, current, onChange }: Props) {
  const t = useTranslations("circles");
  const format = useFormatter();
  const label = week === current ? t("week.this") : week === shiftDay(current, -7) ? t("week.last") : t("week.of", { date: format.dateTime(new Date(`${week}T12:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" }) });
  return (
    <div className="sc-week" role="group" aria-label={t("week.label")}>
      <button type="button" className="sc-icon-button" aria-label={t("week.previous")} onClick={() => onChange(shiftDay(week, -7))}>
        <ArrowRightIcon className="rotate-180 rtl:rotate-0" aria-hidden="true" />
      </button>
      <span className="sc-week-label" aria-live="polite">{label}</span>
      <button type="button" className="sc-icon-button" aria-label={t("week.next")} disabled={week >= current} onClick={() => onChange(shiftDay(week, 7))}>
        <ArrowRightIcon className="rtl:rotate-180" aria-hidden="true" />
      </button>
    </div>
  );
}
