import { requireAdmin } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { shellBaseWorkspace } from "@/lib/services/workspace";
import { SidebarProvider } from "@/context/SidebarContext";
import { cookies } from "next/headers";
import { Suspense } from "react";
import WorkspaceShellLoading from "@/components/studyflow/WorkspaceShellLoading";
import ShellDetails from "@/components/studyflow/ShellDetails";

async function AuthorizedAdminShell({
  children,
  params,
  expanded,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
  expanded: boolean;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin();
  return (
    <SidebarProvider initialExpanded={expanded}><WorkspaceShell initial={shellBaseWorkspace(admin)} admin details={<Suspense fallback={null}><ShellDetails /></Suspense>}>
      {children}
    </WorkspaceShell></SidebarProvider>
  );
}

export default async function AdminLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, cookieStore] = await Promise.all([props.params, cookies()]);
  setRequestLocale(locale);
  const expanded = cookieStore.get("sf-sidebar")?.value !== "collapsed";
  return <Suspense fallback={<WorkspaceShellLoading admin expanded={expanded} />}><AuthorizedAdminShell {...props} expanded={expanded} /></Suspense>;
}
