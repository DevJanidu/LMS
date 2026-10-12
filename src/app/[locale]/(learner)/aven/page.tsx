import { setRequestLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireLearner } from "@/lib/auth";
import { avenBootstrap } from "@/lib/aven/conversations";
import { getGoalDetail, goalReferences } from "@/lib/goals/service";
import AvenCompanion from "@/components/aven/AvenCompanion";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    goal?: string;
    intent?: string;
    notification?: string;
    conversation?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner(),
    query = await searchParams;
  const goalId = z.uuid().safeParse(query.goal).success
    ? query.goal
    : undefined;
  const [initial, references, detail] = await Promise.all([
    avenBootstrap(user.id),
    goalReferences(user.id),
    goalId ? getGoalDetail(user.id, goalId) : undefined,
  ]);
  return (
    <AvenCompanion
      initial={initial}
      references={references}
      timezone={user.timezone}
      goalId={goalId}
      goalTitle={detail?.goal.title}
      intent={query.intent}
      notification={query.notification}
      conversationId={
        z.uuid().safeParse(query.conversation).success
          ? query.conversation
          : undefined
      }
    />
  );
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aven" });
  return { title: t("title") };
}
