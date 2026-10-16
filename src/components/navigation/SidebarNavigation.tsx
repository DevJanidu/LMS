"use client";
import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isActiveRoute, type NavItem } from "./navigation";
interface Props {
  items: NavItem[];
  path: string;
  label: string;
  pendingHref?: string | null;
  onNavigate?: (href: string, active: boolean) => void;
}
/** Primary destinations; labels double as tooltips when the sidebar is collapsed. */
export default function SidebarNavigation({
  items,
  path,
  label,
  pendingHref,
  onNavigate,
}: Props) {
  const t = useTranslations("studyflow");
  const list = useRef<HTMLUListElement>(null);
  const target = pendingHref ?? items.find(({ href }) => isActiveRoute(path, href))?.href;
  // One indicator glides to the current (or pending) row instead of each row drawing its own.
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const place = () => {
      const row = target ? node.querySelector<HTMLElement>(`a[href$="${CSS.escape(target)}"]`) : null;
      node.style.setProperty("--indicator-y", `${row ? row.offsetTop + row.offsetHeight * 0.2 : 0}px`);
      node.style.setProperty("--indicator-h", `${row ? row.offsetHeight * 0.6 : 0}px`);
      node.toggleAttribute("data-indicator", Boolean(row));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);
  return (
    <nav aria-label={label} className="sf-sidebar-nav">
      <ul ref={list}>
        {items.map(({ key, labelKey = key, href, icon: Icon, group, badgeKey }) => {
          const active = isActiveRoute(path, href);
          return (
            <li key={href}>
              {group && (
                <p className="sf-nav-group sf-nav-label">
                  {t(`redesign.${group}`)}
                </p>
              )}
              <SidebarLink
                href={href}
                label={t(labelKey)}
                badge={badgeKey ? t(badgeKey) : undefined}
                active={active}
                pending={pendingHref === href}
                onClick={() => onNavigate?.(href, active)}
              >
                <Icon className="size-5" />
              </SidebarLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
export function SidebarLink({
  href,
  label,
  badge,
  active,
  pending,
  onClick,
  children,
}: {
  href: string;
  label: string;
  badge?: string;
  active: boolean;
  pending?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={active ? "page" : undefined}
      aria-busy={pending || undefined}
      data-pending={pending || undefined}
      aria-label={label}
      data-tooltip={label}
      onClick={onClick}
      className="sf-nav-item"
    >
      <span className="sf-nav-icon">{children}</span>
      <span className="sf-nav-label">{label}</span>
      {badge && <span className="sf-nav-badge sf-nav-label" aria-hidden="true">{badge}</span>}
    </Link>
  );
}
