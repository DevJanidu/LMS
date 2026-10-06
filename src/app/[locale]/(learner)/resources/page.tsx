import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/services/workspace";
import Resources from "@/components/resources/Resources";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ add?: string; search?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireLearner();
  const { add, search } = await searchParams;
  return (
    <Resources initial={await getWorkspace()} add={add === "1"} search={search} />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("resources") };
}
