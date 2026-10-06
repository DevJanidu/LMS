import { getTranslations, setRequestLocale } from "next-intl/server";
import AuthForm from "@/components/auth/AuthForm";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AuthForm token={(await searchParams).token} mode="reset-password" />;
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
