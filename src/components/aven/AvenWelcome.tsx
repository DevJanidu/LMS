"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { greetingName, greetingPeriodForHour } from "@/lib/greeting";
interface Props {
  name: string;
  timezone: string;
  children?: React.ReactNode;
}
const hourIn = (timezone: string) =>
  Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(new Date()),
  );
/** Personalized greeting for an empty conversation; uses the account time zone. */
export default function AvenWelcome({ name, timezone, children }: Props) {
  const t = useTranslations("aven.welcomeScreen");
  // The period is resolved after mount so server and client markup always match.
  const [period, setPeriod] = useState<string>();
  useEffect(() => {
    const update = () => {
      try {
        setPeriod(greetingPeriodForHour(hourIn(timezone)));
      } catch {
        setPeriod(greetingPeriodForHour(new Date().getHours()));
      }
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [timezone]);
  return (
    <div className="aven-welcome">
      <div className="aven-column">
        <h2 className="aven-greeting" data-ready={Boolean(period) || undefined}>
          {t(`greeting.${period ?? "default"}`, { name: greetingName(name) })}
        </h2>
        <p className="aven-greeting-sub">{t("ready")}</p>
        {children}
      </div>
    </div>
  );
}
