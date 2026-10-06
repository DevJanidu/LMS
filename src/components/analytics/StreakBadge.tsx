"use client";
import { useTranslations } from "next-intl";
interface Props { days: number; longest: number }
/** Plain streak copy with the study-day rule available on focus. */
export default function StreakBadge({ days, longest }: Props) { const t = useTranslations("studyflow"); return <span tabIndex={0} title={t("streakRule")} className="text-sm text-orange-600 dark:text-orange-300">{t("streakDays", { days })} · {t("longest", { days: longest })}</span>; }
