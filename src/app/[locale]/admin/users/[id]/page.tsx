import { requireAdmin } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import { loadWorkspace } from "@/lib/services/workspace";
import AdminUserDetail from "@/components/admin/AdminUserDetail";
import { uuidSchema } from "@/lib/validation";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const admin = await requireAdmin();
  if (!uuidSchema.safeParse(id).success) notFound();
  const data = await loadWorkspace(admin.id, { adminTargetId: id });
  if (!data.users.some(user => user.id === id)) notFound();
  return <AdminUserDetail initial={data} id={id} />;
}
