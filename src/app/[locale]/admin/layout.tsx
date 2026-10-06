import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { getWorkspace } from "@/lib/mock";
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <WorkspaceShell initial={getWorkspace()} admin>
      {children}
    </WorkspaceShell>
  );
}
