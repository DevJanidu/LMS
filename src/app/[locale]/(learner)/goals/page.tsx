import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireLearner } from "@/lib/auth";
import { goalReferences, listGoals } from "@/lib/goals/service";
import GoalsDashboard from "@/components/goals/GoalsDashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  const [initial, references] = await Promise.all([
    listGoals(user.id),
    goalReferences(user.id),
  ]);
  return <GoalsDashboard initial={initial} references={references} />;
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "goals" });
  return { title: t("title") };
}
