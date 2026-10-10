import { requireAdmin } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import { adminDetailWorkspace } from "@/lib/services/focused-workspace";
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
  await requireAdmin();
  if (!uuidSchema.safeParse(id).success) notFound();
  const data = await adminDetailWorkspace(id);
  if (!data) notFound();
  return <AdminUserDetail initial={data} id={id} />;
}
