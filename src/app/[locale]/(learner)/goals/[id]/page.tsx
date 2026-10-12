import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireLearner } from "@/lib/auth";
import { getGoalDetail, goalReferences, GoalError } from "@/lib/goals/service";
import GoalDetailView from "@/components/goals/GoalDetailView";
import NextBestActionCard from "@/components/goals/NextBestActionCard";
import { getNextBestActions } from "@/lib/goals/next-action-server";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  if (!z.uuid().safeParse(id).success) notFound();
  const [initial, references, actions] = await Promise.all([
    getGoalDetail(user.id, id),
    goalReferences(user.id),
    getNextBestActions(user.id, { goalId: id, limit: 3 }).catch(() => []),
  ]).catch((error) => {
    if (error instanceof GoalError && error.status === 404) notFound();
    throw error;
  });
  return (
    <GoalDetailView
      initial={initial}
      references={references}
      nextAction={<NextBestActionCard actions={actions} showGoal={false} />}
    />
  );
}
