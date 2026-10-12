"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { BellIcon, ListIcon, MoonIcon, SearchIcon, CommandIcon } from "@/icons";
import AppSidebar from "@/components/navigation/AppSidebar";
import {
  learnerNavigation,
  mobileNavigationKeys,
} from "@/components/navigation/navigation";
import { APP_NAME } from "@/lib/constants";
import BrandLogo from "./BrandLogo";
import PlannerLoading from "@/components/calendar/PlannerLoading";
import LoadingSkeleton from "./LoadingSkeleton";
import WorkspacePageLoading, {
  type WorkspacePage,
} from "./WorkspacePageLoading";
import { primaryLink } from "./styles";

/** Public chrome only; no account details or authorization decisions live here. */
export default function WorkspaceShellLoading({
  admin = false,
  expanded = true,
}: {
  admin?: boolean;
  expanded?: boolean;
}) {
  const t = useTranslations("studyflow");
  const path = usePathname();
  const planner = !admin && path === "/calendar";
  const loadingPage =
    !admin &&
    ["dashboard", "subjects", "study", "analytics", "resources"].includes(
      path.slice(1),
    )
      ? (path.slice(1) as WorkspacePage)
      : undefined;
  const pageWidth = planner
    ? "full"
    : !admin && path === "/study"
      ? "focus"
      : !admin && path === "/settings"
        ? "standard"
        : "wide";
  return (
    <div
      data-workspace-loading
      className={`sf-shell ${admin ? "sf-admin" : ""} ${expanded ? "" : "sf-collapsed"} text-primary dark:text-primary min-h-dvh bg-gray-50 dark:bg-gray-950`}
    >
      <AppSidebar admin={admin} path={path} mobileOpen={false} />
      <div className="sf-main-column">
        <header className="sf-topbar">
          <div className="sf-header-grid">
            <div className="sf-header-left">
              <span className="sf-icon-button sf-desktop-menu">
                <ListIcon />
              </span>
              <span className="sf-mobile-brand">
                <BrandLogo variant="mark" />
              </span>
            </div>
            <span className="sf-search">
              <SearchIcon />
              <span>{t("searchWorkspace")}</span>
              <kbd
                aria-hidden="true"
                className="inline-flex items-center gap-1"
              >
                <CommandIcon className="size-3" /> K
              </kbd>
            </span>
            <div className="sf-header-actions">
              {!admin && (
                <span
                  className={`${primaryLink} sf-header-start`}
                  aria-hidden="true"
                >
                  {t("startStudying")}
                </span>
              )}
              <span className="sf-icon-button sf-theme-control">
                <MoonIcon />
              </span>
              <span className="sf-icon-button">
                <BellIcon />
              </span>
              <span className="sf-profile-trigger">
                <span className="sf-avatar animate-pulse bg-gray-200 dark:bg-gray-800" />
                <span className="sf-profile-name h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              </span>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          className={`sf-content sf-content-${pageWidth}`}
        >
          <div className="sf-page-enter">
            {planner ? (
              <PlannerLoading />
            ) : loadingPage ? (
              <WorkspacePageLoading page={loadingPage} />
            ) : (
              <LoadingSkeleton />
            )}
          </div>
        </main>
        {!planner && (
          <footer className="text-muted dark:text-muted px-4 py-8 text-center text-small sm:px-8">
            {APP_NAME} · {t("footer")}
          </footer>
        )}
      </div>
      {!admin && (
        <nav className="sf-mobile-nav" aria-label={t("learnerNavigation")}>
          {learnerNavigation
            .filter((item) => mobileNavigationKeys.includes(item.key))
            .map(({ key, href, icon: Icon }) => (
              <Link key={href} href={href} prefetch={false}>
                <Icon className="size-5" />
                <span>{t(key)}</span>
              </Link>
            ))}
        </nav>
      )}
    </div>
  );
}
