import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import StudyHistory from "@/components/study/StudyHistory";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StudyHistory initial={getWorkspace()} />;
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
