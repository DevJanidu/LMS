"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { queryAdminUsers, searchWorkspace } from "@/lib/workspace/transport";
import { useSidebar } from "@/context/SidebarContext";
import { Link, usePathname } from "@/i18n/navigation";
import { APP_NAME } from "@/lib/constants";
import AppSidebar from "@/components/navigation/AppSidebar";
import {
  SidebarSlotProvider,
  useSidebarSlotRef,
} from "@/components/navigation/SidebarContextSection";
import {
  learnerNavigation,
  mobileNavigationKeys,
} from "@/components/navigation/navigation";
import { getResources, getSubjects, getTopics } from "@/lib/workspace/queries";
import { useWorkspace } from "@/lib/workspace/store";
import type { Workspace } from "@/types";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import ActiveTimerIndicator from "./ActiveTimerIndicator";
import Field from "./FormFields";
import EmptyState from "./EmptyState";
import FocusLauncher from "@/components/study/FocusLauncher";
import WorkspaceHeader from "./WorkspaceHeader";
import AccountTimezoneSync from "@/components/common/AccountTimezoneSync";
import SaveFeedback from "./SaveFeedback";
import AvenHistorySection from "@/components/aven/AvenHistorySection";
interface Props {
  children: ReactNode;
  initial: Workspace;
  admin?: boolean;
  details?: ReactNode;
}
const mobileItems = learnerNavigation.filter((item) =>
  mobileNavigationKeys.includes(item.key),
);
/** Responsive learner/admin chrome with shared search and timer state. */
export default function WorkspaceShell(props: Props) {
  // The slot provider wraps pages so they can add contextual sidebar sections.
  return (
    <SidebarSlotProvider>
      <Shell {...props} />
    </SidebarSlotProvider>
  );
}
function Shell({ children, initial, admin = false, details }: Props) {
  const t = useTranslations("studyflow");
  const path = usePathname();
  const { isMobileOpen, toggleMobileSidebar, isExpanded } = useSidebar();
  const slotRef = useSidebarSlotRef();
  const data = useWorkspace(initial);
  const search = useModal();
  const openSearch = search.openModal;
  const [query, setQuery] = useState("");
  const [pendingLink, setPendingLink] = useState<{
    from: string;
    href: string;
  } | null>(null);
  const pendingHref = pendingLink?.from === path ? pendingLink.href : null;
  useEffect(() => {
    const clear = setTimeout(() => setPendingLink(null), 0);
    return () => clearTimeout(clear);
  }, [path]);
  const [serverHits, setServerHits] = useState<
    { id: string; title: string; type: string; href: string }[]
  >([]);
  useEffect(() => {
    if (!query.trim()) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      const request = admin
        ? queryAdminUsers({ search: query }, data.user.id).then((result) =>
            result.ok
              ? result.data.rows.map(({ user }) => ({
                  id: user.id,
                  title: `${user.name} · ${user.email}`,
                  type: "learner",
                  href: `/admin/users/${user.id}`,
                }))
              : [],
          )
        : searchWorkspace(query, data.user.id).then((result) => [
            ...result.subjects.map((row) => ({
              ...row,
              type: "subject",
              href: "/subjects/" + row.id,
            })),
            ...result.topics.map((row) => ({
              ...row,
              type: "topic",
              href: "/subjects/" + row.subjectId,
            })),
            ...result.resources.map((row) => ({
              ...row,
              type: "resource",
              href: "/resources?search=" + encodeURIComponent(row.title),
            })),
          ]);
      void request
        .then((result) => {
          if (cancelled) return;
          setServerHits(result.slice(0, 12));
        })
        .catch(() => {
          if (!cancelled) setServerHits([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [admin, query, data.user.id]);
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
  const hits = query.trim()
    ? serverHits
    : (admin
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
        .filter((item) =>
          item.title.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 12);
  return (
    <div
      className={`sf-shell ${admin ? "sf-admin" : ""} ${!isExpanded ? "sf-collapsed" : ""} text-primary dark:text-primary min-h-dvh bg-gray-50 dark:bg-gray-950`}
    >
      <AccountTimezoneSync initial={data} />
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
      <AppSidebar
        admin={admin}
        path={path}
        mobileOpen={isMobileOpen}
        onCloseMobile={toggleMobileSidebar}
        pendingHref={pendingHref}
        sidebarRef={sidebarRef}
        slotRef={slotRef}
        onNavigate={(href, active) => {
          if (!active) setPendingLink({ from: path, href });
          if (isMobileOpen) toggleMobileSidebar();
        }}
      />
      <div className="sf-main-column">
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
          <div key={path} className="sf-page-enter">
            {children}
          </div>
        </main>
        <footer className="text-muted dark:text-muted px-4 py-8 text-center text-small sm:px-8">
          {APP_NAME} · {t("footer")}
        </footer>
      </div>
      <SaveFeedback owner={initial.user.id} />
      {!admin && <ActiveTimerIndicator initial={initial} />}
      {!admin && (
        <nav className="sf-mobile-nav" aria-label={t("learnerNavigation")}>
          {mobileItems.map(({ key, href, icon: Icon }) =>
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
                prefetch={false}
                aria-busy={pendingHref === href || undefined}
                data-pending={pendingHref === href || undefined}
                aria-current={
                  path === href || path.startsWith(`${href}/`)
                    ? "page"
                    : undefined
                }
                onClick={() => {
                  if (path !== href) setPendingLink({ from: path, href });
                }}
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
              className="flex items-center justify-between gap-3 rounded-lg p-3 text-body hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <span>{hit.title}</span>
              <span className="text-muted dark:text-muted text-small">
                {t(hit.type)}
              </span>
            </Link>
          ))}
          {!hits.length && <EmptyState title={t("noResults")} />}
        </div>
      </Modal>
      {details}
      {/* Aven history stays one click away everywhere; the Aven page renders its own live version. */}
      {!admin && path !== "/aven" && (
        <AvenHistorySection
          userId={data.user.id}
          timezone={data.user.timezone}
        />
      )}
    </div>
  );
}
