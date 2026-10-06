import { requireAdmin } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import WorkspaceShell from "@/components/studyflow/WorkspaceShell";
import { getWorkspace } from "@/lib/services/workspace";
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
  return (
    <WorkspaceShell initial={await getWorkspace()} admin>
      {children}
    </WorkspaceShell>
  );
}
