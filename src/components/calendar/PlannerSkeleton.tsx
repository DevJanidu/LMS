"use client";
import { useTranslations } from "next-intl";
export default function PlannerSkeleton() {
  const t = useTranslations("studyflow");
  return (
    <div className="planner-skeleton" role="status">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i}>
          <span className="animate-pulse" />
        </div>
      ))}
    </div>
  );
}
