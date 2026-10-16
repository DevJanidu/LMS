"use client";
import type { ReactNode, Ref } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CloseIcon, PanelIcon } from "@/icons";
import BrandLogo from "@/components/studyflow/BrandLogo";
import SidebarNavigation from "./SidebarNavigation";
import { homeHref, navigationFor } from "./navigation";
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
  /** Account card (avatar, plan, settings and sign-out menu) pinned to the bottom. */
  account?: ReactNode;
  /** Desktop collapse control; absent in the loading shell, which has no sidebar state. */
  collapse?: { expanded: boolean; onToggle: () => void };
}
/**
 * The single application sidebar: brand and collapse control, grouped navigation,
 * a scrollable contextual area (e.g. Aven conversations), and the account card.
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
  account,
  collapse,
}: Props) {
  const t = useTranslations("studyflow");
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
            <BrandLogo className="sf-sidebar-brand-full" />
            <BrandLogo variant="mark" className="sf-sidebar-brand-mark" />
          </Link>
          {collapse && <button
            type="button"
            onClick={collapse.onToggle}
            aria-label={t("redesign.collapse")}
            aria-expanded={collapse.expanded}
            aria-controls="app-sidebar"
            data-tooltip={t("redesign.collapse")}
            className="sf-sidebar-collapse"
          >
            <PanelIcon className="size-4" />
          </button>}
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
      {account && <div className="sf-sidebar-footer">{account}</div>}
    </aside>
  );
}
