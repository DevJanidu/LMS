import { requireAdmin } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { getShellWorkspace } from "@/lib/services/workspace";
import { SidebarProvider } from "@/context/SidebarContext";
import { cookies } from "next/headers";
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [initial, cookieStore] = await Promise.all([getShellWorkspace(), cookies()]);
  return (
    <SidebarProvider initialExpanded={cookieStore.get("sf-sidebar")?.value !== "collapsed"}><WorkspaceShell initial={initial} admin>
      {children}
    </WorkspaceShell></SidebarProvider>
  );
}
