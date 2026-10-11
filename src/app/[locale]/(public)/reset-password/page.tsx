import { getTranslations, setRequestLocale } from "next-intl/server";
import AuthForm from "@/components/auth/AuthForm";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token, error } = await searchParams;
  return <AuthForm token={token} resetLinkError={error === "AUTHENTICATION_UNAVAILABLE" ? "unavailable" : error ? "invalid" : undefined} mode="reset-password" />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("resetPassword") };
}
