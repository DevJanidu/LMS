"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { greetingForDate, greetingImages, greetingName, type GreetingPeriod } from "@/lib/greeting";

interface Props {
  name: string;
  children: ReactNode;
}

/** The browser device's local hour drives the greeting and image. */
export default function DashboardGreeting({ name, children }: Props) {
  const t = useTranslations("studyflow");
  const [period, setPeriod] = useState<GreetingPeriod | null>(null);
  const [failedImage, setFailedImage] = useState<GreetingPeriod | null>(null);

  useEffect(() => {
    window.localStorage.removeItem("studyflow:greeting-time-zone");
    for (const image of Object.values(greetingImages)) {
      const preload = new window.Image();
      preload.src = image.src;
    }
    const check = () => setPeriod(greetingForDate(new Date()).period);
    const initialCheck = window.setTimeout(check, 0);
    const interval = window.setInterval(check, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(initialCheck);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const displayName = greetingName(name);
  const image = period ? greetingImages[period] : null;

  return (
    <div className="sf-dashboard-greeting">
      {image && failedImage !== period && (
        <Image
          key={period}
          src={image.src}
          alt={image.alt}
          fill
          sizes="(min-width: 1280px) 38vw, 100vw"
          unoptimized
          loading="eager"
          className="sf-greeting-image"
          onError={() => setFailedImage(period)}
        />
      )}
      <p className="sf-eyebrow">{t("redesign.personalWorkspace")}</p>
      <h1>{period ? t(`redesign.${period}`, { name: displayName }) : "\u00a0"}</h1>
      {period && <p className="sf-greeting-tagline">{t(`redesign.taglines.${period}`)}</p>}
      {period && <span className="sf-greeting-badge">{t(`redesign.badges.${period}`)}</span>}
      {children}
    </div>
  );
}
