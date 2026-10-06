"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSidebar } from "@/context/SidebarContext";
import { useTheme } from "@/context/ThemeContext";
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
  ListIcon,
  CloseIcon,
  BellIcon,
} from "@/icons";
import { APP_NAME } from "@/lib/constants";
import { getResources, getSubjects, getTopics } from "@/lib/mock";
import { getNotifications } from "@/lib/mock/notifications";
import Badge from "@/components/ui/badge/Badge";
import {
  updateWorkspace,
  useStorageError,
  useNow,
  useWorkspace,
} from "@/lib/mock/store";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import ActiveTimerIndicator from "./ActiveTimerIndicator";
import Field from "./FormFields";
import EmptyState from "./EmptyState";
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
  "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 dark:bg-brand-500 dark:hover:bg-brand-400";
/** Responsive learner/admin chrome with shared search and timer state. */
export default function WorkspaceShell({
  children,
  initial,
  admin = false,
}: Props) {
  const t = useTranslations("studyflow");
  const path = usePathname();
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  const { themeMode, setThemeMode } = useTheme();
  const data = useWorkspace(initial);
  const storageError = useStorageError();
  const search = useModal();
  const openSearch = search.openModal;
  const [query, setQuery] = useState("");
  const sidebarRef = useRef<HTMLElement>(null);
  const clock = useNow();
  const notifications = getNotifications(
    data,
    clock || Date.parse(initial.user.lastActiveAt),
  );
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
  const hits = (
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
    <div className="min-h-dvh bg-gray-50 text-gray-800 dark:bg-gray-950 dark:text-gray-200">
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
        className={`fixed inset-y-0 start-0 z-999 flex w-64 flex-col border-e border-gray-200 bg-white px-5 py-7 transition-transform lg:translate-x-0 dark:border-gray-800 dark:bg-gray-900 ${isMobileOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full lg:rtl:translate-x-0"}`}
      >
        <div className="mb-9 flex items-center justify-between">
          <Link
            href={admin ? "/admin" : "/dashboard"}
            className="flex items-center gap-3 text-xl font-semibold"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-white dark:bg-brand-500">
              <FolderIcon className="size-6" />
            </span>
            {APP_NAME}
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
          <Link
            href="/study"
            className={`${primaryLink} mb-7`}
            onClick={() => {
              if (isMobileOpen) toggleMobileSidebar();
            }}
          >
            {t("startStudying")}
          </Link>
        )}
        <nav className="space-y-2">
          {(admin ? adminItems : learnerItems).map(([key, href, Icon]) => {
            const active =
              path === href ||
              (href !== "/admin" && path.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (isMobileOpen) toggleMobileSidebar();
                }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${active ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"}`}
              >
                <Icon className="size-5" />
                {t(key)}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-4 pt-8">
          {!admin && <ActiveTimerIndicator initial={initial} />}
          <p className="text-theme-xs leading-relaxed text-gray-400 dark:text-gray-500">
            {t("workspaceTagline")}
          </p>
          {admin && (
            <Link
              href="/dashboard"
              className="block text-sm text-brand-600 dark:text-brand-300"
            >
              {t("backLearner")}
            </Link>
          )}
          {process.env.NODE_ENV === "development" && (
            <Link
              href={admin ? "/dashboard" : "/admin"}
              className="block text-theme-xs text-gray-500 dark:text-gray-400"
            >
              {t(admin ? "previewLearner" : "previewAdmin")}
            </Link>
          )}
        </div>
      </aside>
      <div className="lg:ms-64">
        <header className="sticky top-0 z-99 border-b border-gray-200 bg-white/95 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
          <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-8">
            <button
              onClick={toggleMobileSidebar}
              aria-label={t("openMenu")}
              aria-expanded={isMobileOpen}
              className="rounded-lg p-2 lg:hidden"
            >
              <ListIcon className="size-6" />
            </button>
            <button
              onClick={search.openModal}
              className="flex min-w-0 flex-1 items-center justify-between rounded-xl border border-gray-200 px-4 py-2.5 text-start text-sm text-gray-400 dark:border-gray-700 dark:text-gray-400"
            >
              <span className="truncate">{t("searchWorkspace")}</span>
              <kbd className="ms-3 hidden rounded border border-gray-200 px-1.5 text-theme-xs sm:block dark:border-gray-700">
                ⌘ K
              </kbd>
            </button>
            {!admin && (
              <Link
                href="/study"
                className={`${primaryLink} hidden! sm:inline-flex!`}
              >
                {t("startStudying")}
              </Link>
            )}
            <button
              onClick={() =>
                setThemeMode(themeMode === "dark" ? "light" : "dark")
              }
              aria-label={t("toggleTheme")}
              className="rounded-xl border border-gray-200 p-2.5 text-sm dark:border-gray-700"
            >
              {themeMode === "dark" ? "☀" : "☾"}
            </button>
            <details className="relative">
              <summary
                aria-label={t("notifications")}
                className="cursor-pointer list-none rounded-xl border border-gray-200 p-2.5 dark:border-gray-700"
              >
                <BellIcon className="size-5" />
              </summary>
              <div className="absolute end-0 top-full mt-3 w-64 rounded-xl border border-gray-200 bg-white p-4 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
                <h2 className="mb-3 font-medium">{t("notifications")}</h2>
                {data.user.reminders ? (
                  notifications.map((item) => (
                    <button
                      key={item.id}
                      className="mb-2 block w-full rounded-lg p-2 text-start text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() =>
                        updateWorkspace(initial, (state) => ({
                          ...state,
                          notifications: [
                            ...state.notifications.filter(
                              (notification) => notification.id !== item.id,
                            ),
                            { ...item, readAt: new Date().toISOString() },
                          ],
                        }))
                      }
                    >
                      <span className="block font-medium">
                        {item.title}
                        {!item.readAt && " ●"}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatDate(
                          item.scheduledFor,
                          data.user.timezone,
                          "en",
                          true,
                        )}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-sm">{t("remindersOff")}</p>
                )}
                {data.user.reminders && !notifications.length && (
                  <p className="text-sm">{t("noReminders")}</p>
                )}
              </div>
            </details>
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <span className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                  {admin
                    ? "AD"
                    : data.user.name
                        .split(" ")
                        .map((word) => word[0])
                        .slice(0, 2)
                        .join("")}
                </span>
                <span className="hidden text-sm xl:block">
                  {admin ? t("admin") : data.user.name}
                </span>
              </summary>
              <div className="absolute end-0 top-full mt-3 w-48 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
                <Link
                  href={admin ? "/admin/settings" : "/settings"}
                  className="block rounded-lg p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t("profileSettings")}
                </Link>
                <Link
                  href="/login"
                  className="block rounded-lg p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  {t("logout")}
                </Link>
              </div>
            </details>
          </div>
          {!admin && (
            <div className="px-4 pb-3 sm:px-8">
              <Link
                href="/study"
                className={`${primaryLink} mb-3 w-full sm:hidden`}
              >
                {t("startStudying")}
              </Link>
              <ActiveTimerIndicator initial={initial} />
            </div>
          )}
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-7xl p-4 outline-none sm:p-8"
        >
          {storageError && (
            <p
              role="alert"
              className="mb-5 rounded-xl bg-warning-50 p-4 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
            >
              {t("storageError")}
            </p>
          )}
          {children}
        </main>
        <footer className="px-4 py-8 text-center text-theme-xs text-gray-400 sm:px-8 dark:text-gray-500">
          {APP_NAME} · {t("footer")}
        </footer>
      </div>
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
