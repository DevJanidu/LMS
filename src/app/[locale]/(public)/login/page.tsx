import { getTranslations, setRequestLocale } from "next-intl/server";
import AuthForm from "@/components/auth/AuthForm";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { loginDestination } from "@/lib/auth/destination";
import { redirect } from "@/i18n/navigation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { returnTo } = await searchParams;
  if ((await headers()).get("cookie")?.includes("better-auth.session_token=")) {
    const user = await getCurrentUser();
    if (user) redirect({ href: loginDestination(user.role, Boolean(user.onboardingCompletedAt), returnTo), locale });
  }
  return <AuthForm mode="login" returnTo={returnTo} />;
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
