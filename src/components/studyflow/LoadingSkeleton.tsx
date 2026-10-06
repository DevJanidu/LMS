"use client";
import { useTranslations } from "next-intl";
/** Shared accessible route fallback. */
export default function LoadingSkeleton() {
  const t = useTranslations("studyflow");
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="h-10 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div
            key={key}
            className="h-48 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}
