import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import Subjects from "@/components/subjects/Subjects";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ add?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { add } = await searchParams;
  return <Subjects initial={getWorkspace()} add={add === "1"} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studyflow" });
  return { title: t("subjects") };
}
