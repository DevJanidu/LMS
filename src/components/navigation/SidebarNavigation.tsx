"use client";
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
  return (
    <nav aria-label={label} className="sf-sidebar-nav">
      <ul>
        {items.map(({ key, href, icon: Icon, group }) => {
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
                label={t(key)}
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
  active,
  pending,
  onClick,
  children,
}: {
  href: string;
  label: string;
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
    </Link>
  );
}
