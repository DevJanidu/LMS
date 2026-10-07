import { requireLearner } from "@/lib/auth";
import { redirect } from "@/i18n/navigation";
import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { getShellWorkspace } from "@/lib/services/workspace";
import { Suspense } from "react";
import WorkspaceShellLoading from "@/components/studyflow/WorkspaceShellLoading";

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
  return <WorkspaceShell initial={await getShellWorkspace()}>{children}</WorkspaceShell>;
}

export default function LearnerLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  return <Suspense fallback={<WorkspaceShellLoading />}><AuthorizedShell {...props} /></Suspense>;
}
