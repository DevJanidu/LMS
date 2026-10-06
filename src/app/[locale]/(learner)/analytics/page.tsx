import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import Analytics from "@/components/analytics/Analytics";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Analytics initial={getWorkspace()} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("analytics") };
}
