import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireOnboardedLearner } from "@/lib/auth";
import { currentCompetitionWeek } from "@/lib/circles/policy";
import StudyCircles from "@/components/circles/StudyCircles";
import { CIRCLE_TABS, type CircleTab } from "@/components/circles/tabs";

export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireOnboardedLearner();
  const { tab } = await searchParams;
  const initialTab: CircleTab = (CIRCLE_TABS as readonly string[]).includes(tab ?? "") ? (tab as CircleTab) : "overview";
  return <StudyCircles initialTab={initialTab} currentWeek={currentCompetitionWeek()} />;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "circles" });
  return { title: t("title") };
}
