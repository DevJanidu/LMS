import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/services/workspace";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireLearner();
  return <OnboardingWizard initial={await getWorkspace()} initialStep={0} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("onboarding") };
}
