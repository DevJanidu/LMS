import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
  }) => {
    void prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));
vi.mock("@/icons", () => {
  const Icon = () => <svg />;
  return Object.fromEntries(
    [
      "CalenderIcon",
      "CloseIcon",
      "FileIcon",
      "FolderIcon",
      "GridIcon",
      "GroupIcon",
      "PieChartIcon",
      "SettingsIcon",
      "SparklesIcon",
      "TargetIcon",
      "TimerIcon",
    ].map((name) => [name, Icon]),
  );
});
vi.mock("@/components/studyflow/BrandLogo", () => ({
  default: () => <span>Acadence</span>,
}));
import AppSidebar from "@/components/navigation/AppSidebar";
import {
  isActiveRoute,
  learnerNavigation,
  adminNavigation,
} from "@/components/navigation/navigation";
const render = (path: string, admin = false) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AppSidebar admin={admin} path={path} mobileOpen={false} />
    </NextIntlClientProvider>,
  );
describe("unified application sidebar", () => {
  it("renders one sidebar with every destination, a contextual area and settings at the bottom", () => {
    const html = render("/aven");
    expect(html.match(/<aside/g)).toHaveLength(1);
    for (const label of [
      "Home",
      "Subjects",
      "Study",
      "Study Planner",
      "Analytics",
      "Library",
      "Goals",
      "Aven AI",
      "Settings",
    ])
      expect(html).toContain(`aria-label="${label}"`);
    const order = [
      "sf-sidebar-top",
      "sf-sidebar-context",
      "sf-sidebar-footer",
    ].map((name) => html.indexOf(name));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.indexOf('href="/settings"')).toBeGreaterThan(
      html.indexOf("sf-sidebar-footer"),
    );
  });
  it("highlights exactly the active section, including nested routes", () => {
    const html = render("/goals/8d0f7c56-8a51-4a9e-9a6f-2a1f5d1a7c11");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/goals"[^>]*aria-current="page"/);
    expect(isActiveRoute("/subjects/x", "/subjects")).toBe(true);
    expect(isActiveRoute("/study-planner", "/study")).toBe(false);
    expect(isActiveRoute("/admin/users", "/admin")).toBe(false);
  });
  it("uses the admin navigation and settings for administrators", () => {
    const html = render("/admin/users", true);
    expect(html).toContain('href="/admin/settings"');
    expect(html).not.toContain('href="/aven"');
    expect(html).toContain("Management");
    expect(
      adminNavigation.every((item) => item.href.startsWith("/admin")),
    ).toBe(true);
  });
  it("keeps a single source of navigation destinations", () => {
    expect(new Set(learnerNavigation.map((item) => item.href)).size).toBe(
      learnerNavigation.length,
    );
  });
});
