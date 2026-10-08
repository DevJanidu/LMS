import { getTranslations, setRequestLocale } from "next-intl/server";
import PageHeader from "@/components/studyflow/PageHeader";
import { APP_NAME } from "@/lib/constants";
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
      <PageHeader title={t("terms")} description={t("legalDraft")} />
      <p className="text-body text-secondary dark:text-gray-300">
        {t("termsBody", { appName: APP_NAME })}
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
  return { title: t("terms") };
}
