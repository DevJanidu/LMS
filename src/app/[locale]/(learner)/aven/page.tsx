import { setRequestLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireOnboardedLearner } from "@/lib/auth";
import { avenBootstrap } from "@/lib/aven/conversations";
import { getGoalDetail, goalReferences } from "@/lib/goals/service";
import AvenCompanion from "@/components/aven/AvenCompanion";
import AvenUpgrade from "@/components/billing/AvenUpgrade";
import { billingEnforced, getBillingOverview } from "@/lib/billing/entitlements";
import { PLANS } from "@/lib/billing/plans";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    goal?: string;
    intent?: string;
    task?: string;
    taskId?: string;
    notification?: string;
    conversation?: string;
    new?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireOnboardedLearner(),
    query = await searchParams;
  if (billingEnforced()) {
    const { plan } = await getBillingOverview(user.id);
    if (!PLANS[plan].entitlements.aven) return <AvenUpgrade />;
  }
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
      userName={user.name}
      goalId={goalId}
      goalTitle={detail?.goal.title}
      intent={query.intent}
      task={
        query.taskId
          ? z.uuid().safeParse(query.taskId).success
            ? detail?.tasks.find((task) => task.id === query.taskId)?.title
            : undefined
          : query.task?.trim().slice(0, 200) || undefined
      }
      notification={query.notification}
      fresh={query.new === "1"}
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
