import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOnboardedLearner } from "@/lib/auth";
import { getGoalDetail, goalReferences, GoalError } from "@/lib/goals/service";
import GoalDetailView from "@/components/goals/GoalDetailView";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireOnboardedLearner();
  if (!z.uuid().safeParse(id).success) notFound();
  const [initial, references] = await Promise.all([
    getGoalDetail(user.id, id),
    goalReferences(user.id),
  ]).catch((error) => {
    if (error instanceof GoalError && error.status === 404) notFound();
    throw error;
  });
  return <GoalDetailView initial={initial} references={references} />;
}
