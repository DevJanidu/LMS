import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/mock";
import SubjectDetail from "@/components/subjects/SubjectDetail";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <SubjectDetail initial={getWorkspace()} id={id} />;
}
