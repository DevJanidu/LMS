import { requireAdmin } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/services/workspace";
import AdminOverview from "@/components/admin/AdminOverview";
import { APP_NAME } from "@/lib/constants";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  return <AdminOverview initial={await getWorkspace()} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("adminOverview", { appName: APP_NAME }) };
}
