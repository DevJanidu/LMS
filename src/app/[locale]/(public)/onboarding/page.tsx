import { requireLearnerAccount } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getOnboardingWorkspace, getSettings } from "@/lib/services/workspace";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearnerAccount();
  const { minimumAge } = await getSettings();
  return <OnboardingWizard initial={await getOnboardingWorkspace()} initialStep={0} consent={{ accepted: Boolean(user.acceptedTermsAt), dateOfBirth: user.dateOfBirth ?? "", minimumAge: minimumAge ?? 0 }} />;
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
