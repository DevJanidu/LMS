import { getTranslations, setRequestLocale } from "next-intl/server";
import PageHeader from "@/components/studyflow/PageHeader";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("studyflow");
  return (
    <article className="w-full">
      <PageHeader title={t("privacy")} description={t("legalDraft")} />
      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
        {t("privacyBody")}
      </p>
    </article>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("privacy") };
}
