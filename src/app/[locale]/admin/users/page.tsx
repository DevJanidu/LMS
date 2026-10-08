import { requireAdmin } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/services/workspace";
import AdminUsers from "@/components/admin/AdminUsers";
import { listAdminUsers, adminUserFilterSchema } from "@/lib/services/admin-users";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  const [workspace, initialPage] = await Promise.all([getWorkspace(), listAdminUsers(adminUserFilterSchema.parse({}))]);
  return <AdminUsers initial={workspace} initialPage={initialPage} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("users") };
}
