"use client";
import type { Ref } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CloseIcon, SettingsIcon } from "@/icons";
import BrandLogo from "@/components/studyflow/BrandLogo";
import SidebarNavigation, { SidebarLink } from "./SidebarNavigation";
import {
  homeHref,
  isActiveRoute,
  navigationFor,
  settingsHref,
} from "./navigation";
interface Props {
  admin: boolean;
  path: string;
  mobileOpen: boolean;
  onCloseMobile?: () => void;
  pendingHref?: string | null;
  onNavigate?: (href: string, active: boolean) => void;
  sidebarRef?: Ref<HTMLElement>;
  /** Receives the contextual area so pages can portal sections into it. */
  slotRef?: (node: HTMLElement | null) => void;
}
/**
 * The single application sidebar: fixed brand and navigation, a scrollable
 * contextual area (e.g. Aven conversations), and settings pinned to the bottom.
 */
export default function AppSidebar({
  admin,
  path,
  mobileOpen,
  onCloseMobile,
  pendingHref,
  onNavigate,
  sidebarRef,
  slotRef,
}: Props) {
  const t = useTranslations("studyflow");
  const settings = settingsHref(admin);
  return (
    <aside
      id="app-sidebar"
      ref={sidebarRef}
      aria-label={t(admin ? "adminNavigation" : "learnerNavigation")}
      className="sf-sidebar"
      data-mobile-open={mobileOpen || undefined}
    >
      <div className="sf-sidebar-top">
        <div className="sf-sidebar-brand-row">
          <Link href={homeHref(admin)} className="sf-sidebar-brand">
            <BrandLogo />
          </Link>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label={t("closeMenu")}
              className="sf-sidebar-close"
            >
              <CloseIcon className="size-4" />
            </button>
          )}
        </div>
        {admin && <p className="sf-sidebar-badge sf-nav-label">{t("admin")}</p>}
        <SidebarNavigation
          items={navigationFor(admin)}
          path={path}
          label={t("primaryNavigation")}
          pendingHref={pendingHref}
          onNavigate={onNavigate}
        />
      </div>
      <div ref={slotRef} className="sf-sidebar-context" />
      <div className="sf-sidebar-footer">
        <SidebarLink
          href={settings}
          label={t("settings")}
          active={isActiveRoute(path, settings)}
          pending={pendingHref === settings}
          onClick={() => onNavigate?.(settings, isActiveRoute(path, settings))}
        >
          <SettingsIcon className="size-5" />
        </SidebarLink>
      </div>
    </aside>
  );
}
