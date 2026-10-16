import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
vi.mock("@/app/[locale]/auth-actions", () => ({ signOut: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
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
      "BellIcon",
      "ListIcon",
      "MoonIcon",
      "SearchIcon",
      "CommandIcon",
      "ArrowRightIcon",
      "PanelIcon",
      "MoreIcon",
      "LogOutIcon",
      "CreditCardIcon",
      "SunIcon",
      "MonitorIcon",
    ].map((name) => [name, Icon]),
  );
});
vi.mock("@/components/studyflow/BrandLogo", () => ({
  default: () => <span>Acadence</span>,
}));
import AppSidebar from "@/components/navigation/AppSidebar";
import SidebarAccount from "@/components/navigation/SidebarAccount";
import { ThemeProvider } from "@/context/ThemeContext";
import PageBreadCrumb from "@/components/common/PageBreadCrumb";
vi.mock("@/components/calendar/PlannerLoading", () => ({ default: () => null }));
vi.mock("@/components/studyflow/LoadingSkeleton", () => ({ default: () => null }));
vi.mock("@/components/studyflow/WorkspacePageLoading", () => ({ default: () => null }));
import WorkspaceShellLoading from "@/components/studyflow/WorkspaceShellLoading";
import {
  isActiveRoute,
  learnerNavigation,
  adminNavigation,
} from "@/components/navigation/navigation";
const render = (path: string, admin = false) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ThemeProvider>
        <AppSidebar
          admin={admin}
          path={path}
          mobileOpen={false}
          collapse={{ expanded: true, onToggle: () => {} }}
          account={<SidebarAccount name="Nimali Perera" email="nimali@example.com" image={null} admin={admin} planName={admin ? undefined : "Free"} showUpgrade={!admin} />}
        />
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
describe("unified application sidebar", () => {
  it("renders the learner breadcrumb Home link without translation errors", () => {
    const onError = vi.fn();
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC" onError={onError}>
        <PageBreadCrumb pageTitle="Subjects" />
      </NextIntlClientProvider>,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(html).toContain('<a href="/dashboard">Home</a>');
  });
  it("renders the loading shell and mobile Home label without translation errors", () => {
    const onError = vi.fn();
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC" onError={onError}>
        <WorkspaceShellLoading />
      </NextIntlClientProvider>,
    );
    expect(onError).not.toHaveBeenCalled();
    expect(html).toMatch(/sf-mobile-nav[\s\S]*href="\/dashboard"[\s\S]*<span>Home<\/span>/);
  });
  it("renders one sidebar with every destination, a contextual area and the account card at the bottom", () => {
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
    ])
      expect(html).toContain(`aria-label="${label}"`);
    const order = [
      "sf-sidebar-top",
      "sf-sidebar-context",
      "sf-sidebar-footer",
    ].map((name) => html.indexOf(name));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Settings, billing and sign-out live in the account menu in the footer.
    expect(html.indexOf('href="/settings"')).toBeGreaterThan(
      html.indexOf("sf-sidebar-footer"),
    );
    expect(html).toContain('aria-label="Account menu for Nimali Perera"');
    expect(html).toMatch(/role="menu"[^>]*hidden/);
    expect(html).toContain('href="/billing"');
    for (const group of ["Workspace", "Insights", "Tools"]) expect(html).toContain(">" + group + "<");
    expect(html).toMatch(/aria-label="Aven AI"[\s\S]*?sf-nav-badge[^>]*>AI</);
    expect(html).toContain('aria-label="Collapse or expand navigation"');
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
  it("resolves every navigation label to a string instead of a message namespace", () => {
    for (const item of [...learnerNavigation, ...adminNavigation]) {
      const message = (item.labelKey ?? item.key).split(".").reduce<unknown>(
        (value, part) => value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined,
        en.studyflow,
      );
      expect(typeof message, item.key).toBe("string");
    }
  });
});
