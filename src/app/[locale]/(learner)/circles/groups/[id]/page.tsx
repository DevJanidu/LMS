import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOnboardedLearner } from "@/lib/auth";
import { requireMember } from "@/lib/circles/social";
import { currentCompetitionWeek } from "@/lib/circles/policy";
import { GoalError } from "@/lib/goals/service";
import GroupDetail from "@/components/circles/GroupDetail";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireOnboardedLearner();
  if (!z.uuid().safeParse(id).success) notFound();
  // Non-members see the same "not found" as a group that does not exist.
  await requireMember(id, user.id).catch(error => { if (error instanceof GoalError) notFound(); throw error; });
  return <GroupDetail groupId={id} currentWeek={currentCompetitionWeek()} />;
}
