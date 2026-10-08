"use client";

import { useTranslations } from "next-intl";
import PlannerSkeleton from "./PlannerSkeleton";

/** Calendar frame stays the same size while account data and FullCalendar load. */
export default function PlannerLoading() {
  const t = useTranslations("studyflow");
  return (
    <section className="sf-planner-workspace" aria-busy="true" data-workspace-loading>
      <header className="planner-toolbar">
        <div className="planner-title-row">
          <div>
            <h1>{t("calendar")}</h1>
            <p className="mt-1 h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          </div>
          <span className="h-10 w-36 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
        </div>
        <div className="planner-controls">
          <span className="h-9 w-28 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
          <span className="planner-range h-5 w-36 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
          <span className="h-9 w-48 justify-self-end animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
        </div>
      </header>
      <div className="planner-timetable"><PlannerSkeleton /></div>
    </section>
  );
}
