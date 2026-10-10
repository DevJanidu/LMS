"use client";
import { signOut } from "@/app/[locale]/auth-actions";
import { useRouter } from "@/i18n/navigation";
import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSidebar } from "@/context/SidebarContext";
import { Link } from "@/i18n/navigation";
import {
  BellIcon,
  ChevronDownIcon,
  CloseIcon,
  CommandIcon,
  FolderIcon,
  ListIcon,
  SearchIcon,
} from "@/icons";
import { APP_NAME } from "@/lib/constants";
import { getNotifications } from "@/lib/workspace/notifications";
import { updateWorkspace, useWorkspace } from "@/lib/workspace/store";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import FocusLauncher from "@/components/study/FocusLauncher";
import ThemeToggle from "./ThemeToggle";
import { primaryLink } from "./styles";
interface Props {
  initial: Workspace;
  admin: boolean;
  onSearch: () => void;
}
export default function WorkspaceHeader({ initial, admin, onSearch }: Props) {
  const router = useRouter();
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const data = useWorkspace(initial);
  const { isMobileOpen, toggleMobileSidebar, isExpanded, toggleSidebar } =
    useSidebar();
  const notifications = getNotifications(data);
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsavedTheme = useRef<"light" | "dark" | null>(null);
  const saveTheme = (next: "light" | "dark") => {
    unsavedTheme.current = next;
    if (themeSaveTimer.current) clearTimeout(themeSaveTimer.current);
    themeSaveTimer.current = setTimeout(() => {
      themeSaveTimer.current = null;
      unsavedTheme.current = null;
      void updateWorkspace(initial, state => ({ ...state, user: { ...state.user, theme: next } }));
    }, 650);
  };
  const notificationMenu = useRef<HTMLDetailsElement>(null);
  const profileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => () => {
    if (themeSaveTimer.current) clearTimeout(themeSaveTimer.current);
    if (unsavedTheme.current) {
      const next = unsavedTheme.current;
      void updateWorkspace(initial, state => ({ ...state, user: { ...state.user, theme: next } }));
      unsavedTheme.current = null;
    }
  }, [initial]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of [notificationMenu.current, profileMenu.current]) {
        if (menu && !menu.contains(event.target)) menu.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (notificationMenu.current) notificationMenu.current.open = false;
      if (profileMenu.current) profileMenu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <header className="sf-topbar">
      <div className="sf-header-grid">
        <div className="sf-header-left">
          <button
            onClick={toggleSidebar}
            aria-label={t("redesign.collapse")}
            aria-expanded={isExpanded}
            className="sf-icon-button sf-desktop-menu"
          >
            <ListIcon />
          </button>
          <button
            onClick={toggleMobileSidebar}
            aria-label={t("openMenu")}
            aria-expanded={isMobileOpen}
            className="sf-icon-button sf-mobile-menu"
          >
            <ListIcon />
          </button>
          <Link
            href={admin ? "/admin" : "/dashboard"}
            className="sf-mobile-brand"
          >
            <span className="sf-brand-mark">
              <FolderIcon />
            </span>
            <span>{APP_NAME}</span>
          </Link>
        </div>
        <button
          onClick={onSearch}
          aria-label={t("searchWorkspace")}
          className="sf-search"
        >
          <SearchIcon />
          <span>{t("searchWorkspace")}</span>
          <kbd aria-hidden="true" className="inline-flex items-center gap-1"><CommandIcon className="size-3" /> K</kbd>
        </button>
        <div className="sf-header-actions">
          {!admin && (
            <FocusLauncher
              initial={initial}
              className={`${primaryLink} sf-header-start`}
            />
          )}
          <ThemeToggle label={t("toggleTheme")} className="sf-icon-button sf-theme-control" onChange={saveTheme} />
          <details
            ref={notificationMenu}
            className="sf-notification-menu sf-header-dropdown"
          >
            <summary aria-label={t("notifications")} className="sf-icon-button">
              <BellIcon />
            </summary>
            <div className="sf-header-popover">
              <div className="sf-popover-heading">
                <h2>{t("notifications")}</h2>
                <button
                  className="sf-icon-button"
                  aria-label={t("close")}
                  onClick={() => {
                    if (notificationMenu.current)
                      notificationMenu.current.open = false;
                  }}
                >
                  <CloseIcon />
                </button>
              </div>
              {data.shellPending ? <p>{t("loading")}</p> : data.user.reminders ? (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    className="sf-notification-item"
                    onClick={() =>
                      updateWorkspace(initial, (state) => ({
                        ...state,
                        notifications: [
                          ...state.notifications.filter(
                            (n) => n.id !== item.id,
                          ),
                          { ...item, readAt: new Date().toISOString() },
                        ],
                      }))
                    }
                  >
                    <span className="text-body-strong">
                      {item.title}
                      {!item.readAt && (
                        <span aria-hidden="true" className="sf-unread-dot" />
                      )}
                    </span>
                    <span className="text-muted">
                      {formatDate(
                        item.scheduledFor,
                        data.user.timezone,
                        locale,
                        true,
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <p>{t("remindersOff")}</p>
              )}
              {!data.shellPending && data.user.reminders && !notifications.length && (
                <p>{t("noReminders")}</p>
              )}
            </div>
          </details>
          <details
            ref={profileMenu}
            className="sf-profile-menu sf-header-dropdown"
          >
            <summary
              aria-label={t("profileSettings")}
              className="sf-profile-trigger"
            >
              <span className="sf-avatar">
                {data.user.name
                  .trim()
                  .split(/\s+/)
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="sf-profile-name">
                {data.user.name.trim().split(/\s+/)[0]}
              </span>
              <ChevronDownIcon className="sf-profile-chevron" />
            </summary>
            <div className="sf-header-popover sf-account-popover">
              <button
                className="sf-mobile-notification-action"
                onClick={() => {
                  if (profileMenu.current) profileMenu.current.open = false;
                  if (notificationMenu.current)
                    notificationMenu.current.open = true;
                }}
              >
                <BellIcon />
                {t("notifications")}
              </button>
              <Link href={admin ? "/admin/settings" : "/settings"}>
                {t("profileSettings")}
              </Link>
              <ThemeToggle label={t("toggleTheme")} onChange={saveTheme} stateLabels={{ light: t("light"), dark: t("dark") }}>{t("theme")}</ThemeToggle>
              <button onClick={async () => { await signOut(); router.replace("/login"); }}>{t("logout")}</button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
