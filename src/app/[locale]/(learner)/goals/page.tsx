import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireLearner } from "@/lib/auth";
import { goalReferences, listGoals } from "@/lib/goals/service";
import GoalsDashboard from "@/components/goals/GoalsDashboard";
import NextBestActionCard from "@/components/goals/NextBestActionCard";
import { getNextBestActions } from "@/lib/goals/next-action-server";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  const [initial, references, actions] = await Promise.all([
    listGoals(user.id),
    goalReferences(user.id),
    // Ranking is a convenience; the page still works if it cannot be computed.
    getNextBestActions(user.id).catch(() => []),
  ]);
  return (
    <GoalsDashboard
      initial={initial}
      references={references}
      nextAction={<NextBestActionCard actions={actions} />}
    />
  );
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
