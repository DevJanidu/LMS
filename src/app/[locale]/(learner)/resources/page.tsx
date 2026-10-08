import { requireLearner } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resourcePageWorkspace } from "@/lib/services/focused-workspace";
import Resources from "@/components/resources/Resources";
import { listResources, resourceFilterSchema } from "@/lib/services/resources";
import { timed } from "@/lib/perf";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ add?: string; search?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  const { add, search } = await searchParams;
  const [workspace, initialPage] = await Promise.all([resourcePageWorkspace(user),
    timed("page.resources.list", () => listResources(user.id, resourceFilterSchema.parse({ search: search?.slice(0, 100) })))]);
  return <Resources initial={workspace} initialPage={initialPage} add={add === "1"} search={search?.slice(0, 100)} />;
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
