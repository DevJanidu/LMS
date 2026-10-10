import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getShellWorkspace } from "@/lib/services/workspace";
import Settings from "@/components/settings/Settings";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireLearner();
  return <Settings initial={{ ...await getShellWorkspace(), shellOnly: false, pageFields: ["user", "settings"] }} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("settings") };
}
