import { getTranslations, setRequestLocale } from "next-intl/server";
import GoogleSignInCard from "@/components/auth/GoogleSignInCard";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { loginDestination } from "@/lib/auth/destination";
import { signInErrorMessage } from "@/lib/auth/errors";
import { safeReturnPath } from "@/lib/auth/return-path";
import { redirect } from "@/i18n/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { returnTo, error } = await searchParams;
  // The Google callback returns here, so this also routes freshly signed-in users.
  if ((await headers()).get("cookie")?.includes("better-auth.session_token=")) {
    const user = await getCurrentUser();
    if (user) redirect({ href: loginDestination(user.role, Boolean(user.onboardingCompletedAt), returnTo), locale });
  }
  return <GoogleSignInCard returnTo={safeReturnPath(returnTo)} error={signInErrorMessage(error)} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("signIn") };
}
