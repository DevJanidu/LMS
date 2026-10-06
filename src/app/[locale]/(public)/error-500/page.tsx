import { getTranslations, setRequestLocale } from "next-intl/server";
import ErrorPage from "@/components/studyflow/ErrorPage";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ErrorPage code={500} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("serverErrorTitle") };
}
