import { requireAdmin } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { adminPageWorkspace } from "@/lib/services/focused-workspace";
import AdminStorage from "@/components/admin/AdminStorage";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireAdmin();
  return <AdminStorage initial={await adminPageWorkspace(true)} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("storage") };
}
