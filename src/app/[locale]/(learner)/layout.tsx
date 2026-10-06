import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { getWorkspace } from "@/lib/mock";
export default async function LearnerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) { const { locale } = await params; setRequestLocale(locale); return <WorkspaceShell initial={getWorkspace()}>{children}</WorkspaceShell>; }
