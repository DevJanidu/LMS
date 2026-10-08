"use client";

import { useTranslations } from "next-intl";
import PageHeader from "./PageHeader";

export type WorkspacePage = "dashboard" | "subjects" | "study" | "analytics" | "resources";

function Block({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-gray-200 dark:bg-gray-800 ${className}`} />;
}

/** Keep the visible frame and major content dimensions while data streams. */
export default function WorkspacePageLoading({ page }: { page: WorkspacePage }) {
  const t = useTranslations("studyflow");
  if (page === "dashboard") return (
    <div role="status" aria-label={t("loading")} data-workspace-loading>
      <div className="sf-hero sf-dashboard-hero">
        <div className="sf-dashboard-greeting"><Block className="h-4 w-28" /><Block className="mt-5 h-10 w-64 max-w-full" /><Block className="mt-4 h-5 w-48" /></div>
        <Block className="h-60" /><Block className="h-60" />
      </div>
      <div className="sf-dashboard-body"><Block className="h-80" /><Block className="h-80" /></div>
    </div>
  );

  const description = page === "subjects" ? t("subjectsDescription") : page === "study" ? t("studyDescription") : page === "analytics" ? t("analyticsDescription") : t("resourcesDescription");
  return (
    <div role="status" aria-label={t("loading")} data-workspace-loading>
      <PageHeader title={t(page)} description={description} action={page === "analytics" ? undefined : <Block className="h-10 w-36" />} />
      {(page === "subjects" || page === "resources") && <div className={`sf-filter-bar mb-6 grid gap-4 ${page === "subjects" ? "sm:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4"}`}>
        {Array.from({ length: page === "subjects" ? 3 : 4 }, (_, index) => <div key={index}><Block className="mb-2 h-4 w-24" /><Block className="h-11 w-full" /></div>)}
      </div>}
      {page === "analytics" && <div className="sf-metric-strip mb-8 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <Block key={index} className="h-32" />)}
      </div>}
      {page === "study" ? <Block className="sf-focus mx-auto h-96 max-w-3xl" /> : (
        <div className={page === "subjects" ? "sf-subject-collection" : "grid gap-4 md:grid-cols-3"}>
          {Array.from({ length: page === "analytics" ? 2 : 3 }, (_, index) => <Block key={index} className={page === "analytics" ? "h-72" : "h-52"} />)}
        </div>
      )}
    </div>
  );
}
