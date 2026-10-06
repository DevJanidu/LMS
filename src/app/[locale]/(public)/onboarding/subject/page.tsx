import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <OnboardingWizard initial={getWorkspace()} initialStep={2} />;
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
