"use client";
import { useTranslations } from "next-intl";
interface Props {
  detail?: boolean;
}
export default function GoalsLoading({ detail = false }: Props) {
  const t = useTranslations("goals");
  return (
    <div
      aria-busy="true"
      aria-label={t("workspace.loading")}
      className="space-y-5"
    >
      <div aria-hidden="true" className="space-y-3">
        <div className="sf-skeleton h-5 w-36" />
        <div className="sf-skeleton h-10 w-80 max-w-full" />
        <div className="sf-skeleton h-4 w-64 max-w-full" />
      </div>
      {detail ? (
        <>
          <div aria-hidden="true" className="sf-skeleton h-2 w-full" />
          <div aria-hidden="true" className="flex gap-3">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="sf-skeleton h-11 w-20" />
            ))}
          </div>
          <div aria-hidden="true" className="goal-detail-layout">
            <div className="goal-main">
              <div className="goal-panel">
                <div className="sf-skeleton h-6 w-36" />
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="sf-skeleton mt-4 h-11 w-full" />
                ))}
              </div>
              <div className="goal-panel">
                <div className="sf-skeleton h-6 w-40" />
                <div className="sf-skeleton mt-4 h-24 w-full" />
              </div>
            </div>
            <div className="goal-context">
              <div className="goal-panel">
                <div className="sf-skeleton h-6 w-32" />
                <div className="sf-skeleton mt-4 h-24 w-full" />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div aria-hidden="true" className="goal-metrics">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index}>
                <div className="sf-skeleton h-4 w-24" />
                <div className="sf-skeleton mt-3 h-8 w-12" />
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="goal-filter-bar">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="sf-skeleton h-11 w-full" />
            ))}
          </div>
          <div aria-hidden="true" className="goal-grid">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="goal-card">
                <div className="sf-skeleton h-5 w-24" />
                <div className="sf-skeleton h-8 w-full" />
                <div className="sf-skeleton h-2 w-full" />
                <div className="sf-skeleton h-16 w-full" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
