import { requireOnboardedLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getShellWorkspace } from "@/lib/services/workspace";
import { settingsOverview } from "@/lib/services/settings-overview";
import Settings from "@/components/settings/Settings";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireOnboardedLearner();
  const [workspace, overview] = await Promise.all([getShellWorkspace(user), settingsOverview(user)]);
  return <Settings initial={{ ...workspace, shellOnly: false, pageFields: ["user", "settings"] }} overview={overview} />;
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
