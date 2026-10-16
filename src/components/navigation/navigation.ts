import type { ComponentType, SVGProps } from "react";
import {
  CalenderIcon,
  FileIcon,
  FolderIcon,
  GridIcon,
  GroupIcon,
  PieChartIcon,
  SparklesIcon,
  TargetIcon,
  TimerIcon,
} from "@/icons";
/** Single source of truth for application navigation (sidebar, loading shell and mobile bar). */
export interface NavItem {
  /** Translation key in the `studyflow` namespace. */
  key: string;
  /** Label path when the destination key names a message namespace. */
  labelKey?: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Optional group heading (translation key under `studyflow.redesign`). */
  group?: string;
  /** Optional short tag beside the label (translation key in `studyflow`). */
  badgeKey?: string;
}
export const learnerNavigation: NavItem[] = [
  { key: "dashboard", labelKey: "dashboard.navLabel", href: "/dashboard", icon: GridIcon, group: "workspace" },
  { key: "subjects", href: "/subjects", icon: FolderIcon },
  { key: "study", href: "/study", icon: TimerIcon },
  { key: "calendar", href: "/calendar", icon: CalenderIcon },
  { key: "analytics", href: "/analytics", icon: PieChartIcon, group: "insights" },
  { key: "goals", href: "/goals", icon: TargetIcon },
  { key: "circles", href: "/circles", icon: GroupIcon },
  { key: "resources", href: "/resources", icon: FileIcon, group: "tools" },
  { key: "aven", href: "/aven", icon: SparklesIcon, badgeKey: "aiBadge" },
];
export const adminNavigation: NavItem[] = [
  { key: "overview", href: "/admin", icon: GridIcon },
  { key: "users", href: "/admin/users", icon: GroupIcon, group: "management" },
  {
    key: "analytics",
    href: "/admin/analytics",
    icon: PieChartIcon,
    group: "insights",
  },
  { key: "storage", href: "/admin/storage", icon: FileIcon, group: "system" },
];
/** Destinations in the mobile bottom bar, in order. */
export const mobileNavigationKeys = [
  "dashboard",
  "subjects",
  "study",
  "calendar",
];
export const navigationFor = (admin: boolean) =>
  admin ? adminNavigation : learnerNavigation;
export const settingsHref = (admin: boolean) =>
  admin ? "/admin/settings" : "/settings";
export const homeHref = (admin: boolean) => (admin ? "/admin" : "/dashboard");
/** Section roots match their sub-pages; the admin overview matches only itself. */
export const isActiveRoute = (path: string, href: string) =>
  path === href || (href !== "/admin" && path.startsWith(`${href}/`));
