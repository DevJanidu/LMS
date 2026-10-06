"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { searchWorkspace } from "@/app/[locale]/actions";
import { useTheme } from "@/context/ThemeContext";
import { useSidebar } from "@/context/SidebarContext";
import { Link, usePathname } from "@/i18n/navigation";
import {
  GridIcon,
  FolderIcon,
  TimeIcon,
  CalenderIcon,
  PieChartIcon,
  FileIcon,
  UserCircleIcon,
  GroupIcon,
  CloseIcon,
} from "@/icons";
import { APP_NAME } from "@/lib/constants";
import { getResources, getSubjects, getTopics } from "@/lib/workspace/queries";
import Badge from "@/components/ui/badge/Badge";
import { useWorkspaceError, useWorkspace } from "@/lib/workspace/store";
import type { Workspace } from "@/types";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import ActiveTimerIndicator from "./ActiveTimerIndicator";
import Field from "./FormFields";
import EmptyState from "./EmptyState";
import FocusLauncher from "@/components/study/FocusLauncher";
import WorkspaceHeader from "./WorkspaceHeader";
interface Props {
  children: ReactNode;
  initial: Workspace;
  admin?: boolean;
}
const learnerItems = [
  ["dashboard", "/dashboard", GridIcon],
  ["subjects", "/subjects", FolderIcon],
  ["study", "/study", TimeIcon],
  ["calendar", "/calendar", CalenderIcon],
  ["analytics", "/analytics", PieChartIcon],
  ["resources", "/resources", FileIcon],
  ["settings", "/settings", UserCircleIcon],
] as const;
const adminItems = [
  ["overview", "/admin", GridIcon],
  ["users", "/admin/users", GroupIcon],
  ["analytics", "/admin/analytics", PieChartIcon],
  ["storage", "/admin/storage", FileIcon],
  ["settings", "/admin/settings", UserCircleIcon],
] as const;
export const primaryLink =
  "sf-button sf-primary-action inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400";
/** Responsive learner/admin chrome with shared search and timer state. */
export default function WorkspaceShell({
  children,
  initial,
  admin = false,
}: Props) {
  const t = useTranslations("studyflow");
  const path = usePathname();
  const { isMobileOpen, toggleMobileSidebar, isExpanded } = useSidebar();
  const data = useWorkspace(initial);
  const { setThemeMode } = useTheme();
  useEffect(() => { setThemeMode(data.user.theme); }, [data.user.theme, setThemeMode]);
  const storageError = useWorkspaceError();
  const search = useModal();
  const openSearch = search.openModal;
  const [query, setQuery] = useState("");
  const [serverHits, setServerHits] = useState<{ id: string; title: string; type: string; href: string }[]>([]);
  useEffect(() => {
    if (admin || !query.trim()) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      void searchWorkspace(query).then(result => {
        if (cancelled) return;
        setServerHits([
          ...result.subjects.map(row => ({ ...row, type: "subject", href: "/subjects/" + row.id })),
          ...result.topics.map(row => ({ ...row, type: "topic", href: "/subjects/" + row.subjectId })),
          ...result.resources.map(row => ({ ...row, type: "resource", href: "/resources?search=" + encodeURIComponent(row.title) })),
        ].slice(0, 12));
      }).catch(() => { if (!cancelled) setServerHits([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [admin, query, data.subjects, data.topics, data.resources]);
  const sidebarRef = useRef<HTMLElement>(null);
  const pageWidth =
    path === "/calendar"
      ? "full"
      : !admin && path === "/study"
        ? "focus"
        : !admin && path === "/settings"
          ? "standard"
          : "wide";
  useEffect(() => {
    if (!isMobileOpen) return;
    const previous = document.activeElement;
    const sidebar = sidebarRef.current;
    const focusable = () =>
      sidebar?.querySelectorAll<HTMLElement>("a[href],button:not(:disabled)");
    focusable()?.[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") toggleMobileSidebar();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items?.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isMobileOpen, toggleMobileSidebar]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [openSearch]);
  const hits = !admin && query.trim() ? serverHits : (
    admin
      ? data.users.map((user) => ({
          id: user.id,
          title: `${user.name} · ${user.email}`,
          type: "learner",
          href: `/admin/users/${user.id}`,
        }))
      : [
          ...getSubjects(data).map((subject) => ({
            id: subject.id,
            title: subject.title,
            type: "subject",
            href: `/subjects/${subject.id}`,
          })),
          ...getTopics(data).map((topic) => ({
            id: topic.id,
            title: topic.title,
            type: "topic",
            href: `/subjects/${topic.subjectId}`,
          })),
          ...getResources(data).map((resource) => ({
            id: resource.id,
            title: resource.title,
            type: "resource",
            href: `/resources?search=${encodeURIComponent(resource.title)}`,
          })),
        ]
  )
    .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 12);
  return (
    <div
      className={`sf-shell ${admin ? "sf-admin" : ""} ${!isExpanded ? "sf-collapsed" : ""} min-h-dvh bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-200`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-99999 focus:rounded-lg focus:bg-brand-500 focus:p-3 focus:text-white"
      >
        {t("skipContent")}
      </a>
      {isMobileOpen && (
        <button
          aria-label={t("closeMenu")}
          className="fixed inset-0 z-99 bg-gray-950/50 lg:hidden dark:bg-gray-950/70"
          onClick={toggleMobileSidebar}
        />
      )}
      <aside
        ref={sidebarRef}
        aria-label={t(admin ? "adminNavigation" : "learnerNavigation")}
        className={`sf-sidebar fixed inset-y-0 start-0 z-999 flex w-64 flex-col border-e border-gray-200 bg-white px-5 py-7 transition-transform lg:translate-x-0 dark:border-gray-800 dark:bg-gray-900 ${isMobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0"}`}
      >
        <div className="sf-sidebar-brand-row mb-7 flex items-center justify-between">
          <Link
            href={admin ? "/admin" : "/dashboard"}
            className="sf-sidebar-brand flex items-center gap-3 text-xl font-semibold"
          >
            <span className="sf-brand-mark">
              <FolderIcon className="size-5" />
            </span>
            <span className="sf-nav-label">{APP_NAME}</span>
          </Link>
          <button
            onClick={toggleMobileSidebar}
            aria-label={t("closeMenu")}
            className="p-1 lg:hidden"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        {admin ? (
          <div className="mb-5">
            <Badge>{t("admin")}</Badge>
          </div>
        ) : (
          <FocusLauncher
            initial={initial}
            sidebar
            className={`${primaryLink} sf-sidebar-cta mb-7`}
            onOpen={() => {
              if (isMobileOpen) toggleMobileSidebar();
            }}
          />
        )}
        <nav className="space-y-1">
          {(admin ? adminItems : learnerItems).map(([key, href, Icon]) => {
            const active =
              path === href ||
              (href !== "/admin" && path.startsWith(`${href}/`));
            return (
              <div
                key={href}
                className={key === "settings" ? "sf-settings-group" : undefined}
              >
                {admin && ["users", "analytics", "storage"].includes(key) && (
                  <p className="sf-nav-group sf-nav-label">
                    {t(
                      `redesign.${key === "users" ? "management" : key === "analytics" ? "insights" : "system"}`,
                    )}
                  </p>
                )}
                <Link
                  href={href}
                  title={t(key)}
                  aria-label={t(key)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    if (isMobileOpen) toggleMobileSidebar();
                  }}
                  className="sf-nav-item"
                >
                  <span className="sf-nav-icon">
                    <Icon className="size-5" />
                  </span>
                  <span className="sf-nav-label">{t(key)}</span>
                </Link>
              </div>
            );
          })}
        </nav>
        <div className="sf-sidebar-bottom mt-auto space-y-4 pt-8">
          <p className="text-theme-xs leading-relaxed text-gray-400 dark:text-gray-500">
            {t("workspaceTagline")}
          </p>
        </div>
      </aside>
      <div className="sf-main-column lg:ms-64">
        <WorkspaceHeader
          initial={initial}
          admin={admin}
          onSearch={search.openModal}
        />
        <main
          id="main-content"
          tabIndex={-1}
          className={`sf-content sf-content-${pageWidth} outline-none`}
        >
          {storageError && (
            <p
              role="alert"
              className="mb-5 rounded-xl bg-warning-50 p-4 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
            >
              {t(storageError)}
            </p>
          )}
          <div key={path} className="sf-page-enter">
            {children}
          </div>
        </main>
        <footer className="px-4 py-8 text-center text-theme-xs text-gray-400 sm:px-8 dark:text-gray-500">
          {APP_NAME} · {t("footer")}
        </footer>
      </div>
      {!admin && <ActiveTimerIndicator initial={initial} />}
      {!admin && (
        <nav className="sf-mobile-nav" aria-label={t("learnerNavigation")}>
          {learnerItems.slice(0, 4).map(([key, href, Icon]) =>
            key === "study" ? (
              <FocusLauncher
                key={key}
                initial={initial}
                mobile
                active={path === "/study" || path.startsWith("/study/")}
                className="sf-mobile-focus"
              />
            ) : (
              <Link
                key={href}
                href={href}
                aria-current={
                  path === href || path.startsWith(`${href}/`)
                    ? "page"
                    : undefined
                }
              >
                <Icon className="size-5" />
                <span>{t(key)}</span>
              </Link>
            ),
          )}
        </nav>
      )}
      <Modal
        isOpen={search.isOpen}
        onClose={search.closeModal}
        title={t("searchWorkspace")}
      >
        <Field
          label={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-4 space-y-1">
          {hits.map((hit) => (
            <Link
              key={hit.id}
              href={hit.href}
              onClick={search.closeModal}
              className="flex items-center justify-between gap-3 rounded-lg p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span>{hit.title}</span>
              <span className="text-theme-xs text-gray-400 dark:text-gray-500">
                {t(hit.type)}
              </span>
            </Link>
          ))}
          {!hits.length && <EmptyState title={t("noResults")} />}
        </div>
      </Modal>
    </div>
  );
}
