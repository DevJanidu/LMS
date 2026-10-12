"use client";
import { useTranslations } from "next-intl";
import {
  BellIcon,
  PanelIcon,
  PlusIcon,
  SettingsIcon,
  TargetIcon,
} from "@/icons";
interface Props {
  title: string;
  goalTitle?: string;
  sidebarOpen: boolean;
  disabled: boolean;
  onToggleSidebar: () => void;
  onNew: () => void;
  onNotifications: () => void;
  onSettings: () => void;
}
export default function AvenTopBar({
  title,
  goalTitle,
  sidebarOpen,
  disabled,
  onToggleSidebar,
  onNew,
  onNotifications,
  onSettings,
}: Props) {
  const t = useTranslations("aven");
  return (
    <header className="aven-topbar">
      <button
        type="button"
        className="aven-icon-button"
        aria-controls="aven-sidebar"
        aria-expanded={sidebarOpen}
        aria-label={t(sidebarOpen ? "hideConversations" : "showConversations")}
        title={t(sidebarOpen ? "hideConversations" : "showConversations")}
        onClick={onToggleSidebar}
      >
        <PanelIcon className="size-4" />
      </button>
      <button
        type="button"
        className="aven-icon-button aven-mobile-only"
        aria-label={t("newConversation")}
        disabled={disabled}
        onClick={onNew}
      >
        <PlusIcon className="size-4" />
      </button>
      <div className="aven-topbar-title">
        <h1>{title}</h1>
        {goalTitle && (
          <span
            className="aven-goal-chip"
            title={t("goalContext", { title: goalTitle })}
          >
            <TargetIcon className="size-3.5" />
            <span className="truncate">{goalTitle}</span>
          </span>
        )}
      </div>
      <button
        type="button"
        className="aven-icon-button"
        aria-label={t("notificationCenter")}
        title={t("notificationCenter")}
        aria-haspopup="dialog"
        onClick={onNotifications}
      >
        <BellIcon className="size-4" />
      </button>
      <button
        type="button"
        className="aven-icon-button"
        aria-label={t("settings")}
        title={t("settings")}
        aria-haspopup="dialog"
        onClick={onSettings}
      >
        <SettingsIcon className="size-4" />
      </button>
    </header>
  );
}
