import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { studyPageWorkspace } from "@/lib/services/focused-workspace";
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
  const user = await requireLearner();
  const { subject, topic } = await searchParams;
  return (
    <TimerWidget initial={await studyPageWorkspace(user)} subject={subject} topic={topic} />
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
