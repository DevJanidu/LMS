import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import TimerWidget from "@/components/study/TimerWidget";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ subject?: string; topic?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { subject, topic } = await searchParams;
  return (
    <TimerWidget initial={getWorkspace()} subject={subject} topic={topic} />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("study") };
}
