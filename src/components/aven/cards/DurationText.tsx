"use client";
import { useTranslations } from "next-intl";
export default function DurationText({ minutes }: { minutes: number }) {
  const t = useTranslations("aven.cards");
  const hours = Math.floor(minutes / 60),
    rest = Math.round(minutes % 60);
  return (
    <>
      {hours
        ? t("durationHours", { hours, minutes: rest })
        : t("durationMinutes", { minutes: rest })}
    </>
  );
}
