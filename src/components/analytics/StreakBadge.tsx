"use client";
import { useTranslations } from "next-intl";
interface Props {
  days: number;
  longest: number;
  minutes?: number;
}
/** Plain streak copy with the study-day rule available on focus. */
export default function StreakBadge({ days, longest, minutes = 10 }: Props) {
  const t = useTranslations("studyflow");
  return (
    <span
      tabIndex={0}
      title={t("streakRule", { minutes })}
      className="text-body text-orange-600 dark:text-orange-300"
    >
      {t("streakDays", { days })} · {t("longest", { days: longest })}
    </span>
  );
}
