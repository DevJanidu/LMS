import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { studyPageWorkspace } from "@/lib/services/focused-workspace";
import StudyHistory from "@/components/study/StudyHistory";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const account = await requireLearner();
  return <StudyHistory initial={await studyPageWorkspace(account, true)} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("studyHistory") };
}
