"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { APP_NAME } from "@/lib/constants";
import LoadingSkeleton from "./LoadingSkeleton";

const routes = ["dashboard", "subjects", "study", "calendar", "analytics", "resources", "settings"] as const;

/** Static chrome while authentication and shell details load. */
export default function WorkspaceShellLoading() {
  const t = useTranslations("studyflow");
  return (
    <div className="sf-shell min-h-dvh bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-200">
      <aside aria-label={t("learnerNavigation")} className="sf-sidebar fixed inset-y-0 start-0 z-999 flex w-64 flex-col border-e border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-gray-900">
        <Link href="/dashboard" className="sf-sidebar-brand mb-7 text-xl font-semibold">{APP_NAME}</Link>
        <nav className="space-y-1">
          {routes.map(route => <Link key={route} href={`/${route}`} className="sf-nav-item">{t(route)}</Link>)}
        </nav>
      </aside>
      <div className="sf-main-column lg:ms-64">
        <header className="sf-topbar"><div className="sf-header-grid"><div className="sf-header-left"><span className="font-semibold">{APP_NAME}</span></div></div></header>
        <main id="main-content" className="sf-content sf-content-wide"><LoadingSkeleton /></main>
      </div>
    </div>
  );
}
