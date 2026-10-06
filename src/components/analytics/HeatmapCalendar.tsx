"use client";
import { useLocale, useTranslations } from "next-intl";
import { shiftDay } from "@/lib/analytics";
import { duration } from "@/lib/time";
interface Props {
  month: string;
  totals: Record<string, number>;
  weekStartDay: 0 | 1;
}
/** Monthly study intensity grid with focusable day labels. */
export default function HeatmapCalendar({
  month,
  totals,
  weekStartDay,
}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const first = `${month}-01`;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const offset = (weekday - weekStartDay + 7) % 7;
  const days: string[] = [];
  for (let day = first; day.startsWith(month); day = shiftDay(day, 1))
    days.push(day);
  return (
    <div>
      <p className="mb-4 text-sm font-medium">
        {new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${first}T12:00:00Z`))}
      </p>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="text-center text-theme-xs text-gray-400 dark:text-gray-500"
          >
            {t(`weekdaysShort.d${(weekStartDay + index) % 7}`)}
          </div>
        ))}
        {Array.from({ length: offset }, (_, index) => (
          <span key={`empty-${index}`} />
        ))}
        {days.map((day) => {
          const seconds = totals[day] ?? 0;
          return (
            <div
              key={day}
              tabIndex={0}
              aria-label={`${day}: ${duration(seconds)}`}
              title={`${day}: ${duration(seconds)}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-theme-xs ${seconds >= 3600 ? "bg-brand-500 text-white dark:bg-brand-500" : seconds >= 600 ? "bg-brand-200 text-brand-800 dark:bg-brand-500/40 dark:text-white" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}
            >
              {Number(day.slice(-2))}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-theme-xs text-gray-400 dark:text-gray-500">
        {t("heatmapHelp")}
      </p>
    </div>
  );
}
