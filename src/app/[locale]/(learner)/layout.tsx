import { requireLearner } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { shellBaseWorkspace } from "@/lib/services/workspace";
import { SidebarProvider } from "@/context/SidebarContext";
import { cookies } from "next/headers";
import { Suspense } from "react";
import WorkspaceShellLoading from "@/components/studyflow/WorkspaceShellLoading";
import ShellDetails from "@/components/studyflow/ShellDetails";

async function AuthorizedShell({
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
  const user = await requireLearner();
  if (!user.onboardingCompletedAt) redirect({ href: "/onboarding", locale });
  return <SidebarProvider initialExpanded={expanded}><WorkspaceShell initial={shellBaseWorkspace(user)} details={<Suspense fallback={null}><ShellDetails /></Suspense>}>{children}</WorkspaceShell></SidebarProvider>;
}

export default async function LearnerLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, cookieStore] = await Promise.all([props.params, cookies()]);
  setRequestLocale(locale);
  const expanded = cookieStore.get("sf-sidebar")?.value !== "collapsed";
  return <Suspense fallback={<WorkspaceShellLoading expanded={expanded} />}><AuthorizedShell {...props} expanded={expanded} /></Suspense>;
}
