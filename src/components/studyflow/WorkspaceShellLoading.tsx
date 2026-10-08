"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import {
  BellIcon, CalenderIcon, FileIcon, FolderIcon, GridIcon,
  GroupIcon, ListIcon, MoonIcon, PieChartIcon, SearchIcon,
  StartPlayIcon, TimerIcon, SettingsIcon,
} from "@/icons";
import { APP_NAME } from "@/lib/constants";
import PlannerLoading from "@/components/calendar/PlannerLoading";
import LoadingSkeleton from "./LoadingSkeleton";
import WorkspacePageLoading, { type WorkspacePage } from "./WorkspacePageLoading";
import { primaryLink } from "./styles";

const learnerItems = [
  ["dashboard", "/dashboard", GridIcon],
  ["subjects", "/subjects", FolderIcon],
  ["study", "/study", TimerIcon],
  ["calendar", "/calendar", CalenderIcon],
  ["analytics", "/analytics", PieChartIcon],
  ["resources", "/resources", FileIcon],
] as const;
const adminItems = [
  ["overview", "/admin", GridIcon],
  ["users", "/admin/users", GroupIcon],
  ["analytics", "/admin/analytics", PieChartIcon],
  ["storage", "/admin/storage", FileIcon],
] as const;

/** Public chrome only; no account details or authorization decisions live here. */
export default function WorkspaceShellLoading({ admin = false, expanded = true }: { admin?: boolean; expanded?: boolean }) {
  const t = useTranslations("studyflow");
  const path = usePathname();
  const items = admin ? adminItems : learnerItems;
  const planner = !admin && path === "/calendar";
  const loadingPage = !admin && ["dashboard", "subjects", "study", "analytics", "resources"].includes(path.slice(1)) ? path.slice(1) as WorkspacePage : undefined;
  const pageWidth = planner ? "full" : !admin && path === "/study" ? "focus" : !admin && path === "/settings" ? "standard" : "wide";
  const settingsHref = admin ? "/admin/settings" : "/settings";
  return (
    <div data-workspace-loading className={`sf-shell ${admin ? "sf-admin" : ""} ${expanded ? "" : "sf-collapsed"} min-h-dvh bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-200`}>
      <aside aria-label={t(admin ? "adminNavigation" : "learnerNavigation")} className="sf-sidebar fixed inset-y-0 start-0 z-999 flex w-64 flex-col border-e border-gray-200 bg-white px-5 py-7 -translate-x-full rtl:translate-x-full lg:translate-x-0 lg:rtl:translate-x-0 dark:border-gray-800 dark:bg-gray-900">
        <div className="sf-sidebar-brand-row mb-7 flex items-center justify-between">
          <Link href={admin ? "/admin" : "/dashboard"} className="sf-sidebar-brand flex items-center gap-3 text-xl font-semibold">
            <span className="sf-brand-mark"><FolderIcon className="size-5" /></span>
            <span className="sf-nav-label">{APP_NAME}</span>
          </Link>
        </div>
        {admin ? <div className="mb-5"><span className="sf-nav-label text-theme-xs">{t("admin")}</span></div> : (
          <span className={`${primaryLink} sf-sidebar-cta mb-7`} aria-hidden="true"><span className="sf-nav-icon"><StartPlayIcon className="size-5" /></span><span className="sf-nav-label">{t("startStudying")}</span></span>
        )}
        <nav className="space-y-1">
          {items.map(([key, href, Icon]) => (
            <div key={href}>
              {admin && ["users", "analytics", "storage"].includes(key) && <p className="sf-nav-group sf-nav-label">{t(`redesign.${key === "users" ? "management" : key === "analytics" ? "insights" : "system"}`)}</p>}
              <Link href={href} prefetch={false} aria-current={path === href || (href !== "/admin" && path.startsWith(`${href}/`)) ? "page" : undefined} className="sf-nav-item">
                <span className="sf-nav-icon"><Icon className="size-5" /></span><span className="sf-nav-label">{t(key)}</span>
              </Link>
            </div>
          ))}
        </nav>
        <div className="sf-sidebar-footer mt-auto">
          <div className="sf-settings-group"><Link href={settingsHref} prefetch={false} aria-current={path === settingsHref ? "page" : undefined} className="sf-nav-item"><span className="sf-nav-icon"><SettingsIcon className="size-5" /></span><span className="sf-nav-label">{t("settings")}</span></Link></div>
          <div className="sf-sidebar-bottom"><p className="text-theme-xs leading-relaxed text-gray-400 dark:text-gray-500">{t("workspaceTagline")}</p></div>
        </div>
      </aside>
      <div className="sf-main-column lg:ms-64">
        <header className="sf-topbar"><div className="sf-header-grid">
          <div className="sf-header-left"><span className="sf-icon-button sf-desktop-menu"><ListIcon /></span><span className="sf-mobile-brand"><span className="sf-brand-mark"><FolderIcon /></span><span>{APP_NAME}</span></span></div>
          <span className="sf-search"><SearchIcon /><span>{t("searchWorkspace")}</span><kbd aria-hidden="true">⌘ K</kbd></span>
          <div className="sf-header-actions">
            {!admin && <span className={`${primaryLink} sf-header-start`} aria-hidden="true">{t("startStudying")}</span>}
            <span className="sf-icon-button sf-theme-control"><MoonIcon /></span>
            <span className="sf-icon-button"><BellIcon /></span>
            <span className="sf-profile-trigger"><span className="sf-avatar animate-pulse bg-gray-200 dark:bg-gray-800" /><span className="sf-profile-name h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-800" /></span>
          </div>
        </div></header>
        <main id="main-content" className={`sf-content sf-content-${pageWidth}`}>
          <div className="sf-page-enter">{planner ? <PlannerLoading /> : loadingPage ? <WorkspacePageLoading page={loadingPage} /> : <LoadingSkeleton />}</div>
        </main>
        {!planner && <footer className="px-4 py-8 text-center text-theme-xs text-gray-400 sm:px-8 dark:text-gray-500">{APP_NAME} · {t("footer")}</footer>}
      </div>
      {!admin && <nav className="sf-mobile-nav" aria-label={t("learnerNavigation")}>
        {learnerItems.slice(0, 4).map(([key, href, Icon]) => <Link key={href} href={href} prefetch={false}><Icon className="size-5" /><span>{t(key)}</span></Link>)}
      </nav>}
    </div>
  );
}
