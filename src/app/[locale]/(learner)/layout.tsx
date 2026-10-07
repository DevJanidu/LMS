import { requireLearner } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { getShellWorkspace } from "@/lib/services/workspace";
import { SidebarProvider } from "@/context/SidebarContext";
import { cookies } from "next/headers";

async function AuthorizedShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  if (!user.onboardingCompletedAt) redirect({ href: "/onboarding", locale });
  const [initial, cookieStore] = await Promise.all([getShellWorkspace(), cookies()]);
  return <SidebarProvider initialExpanded={cookieStore.get("sf-sidebar")?.value !== "collapsed"}><WorkspaceShell initial={initial}>{children}</WorkspaceShell></SidebarProvider>;
}

export default function LearnerLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <AuthorizedShell {...props} />;
}
