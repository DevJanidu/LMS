import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireLearner } from "@/lib/auth";
import { goalReferences, listGoals } from "@/lib/goals/service";
import GoalsDashboard from "@/components/goals/GoalsDashboard";
import NextBestActionCard from "@/components/goals/NextBestActionCard";
import { getNextBestActions } from "@/lib/goals/next-action-server";
import { z } from "zod";
import { goalStatuses } from "@/lib/goals/validation";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireLearner();
  const paramsQuery = await searchParams;
  const querySchema = z.object({
    page: z.coerce.number().int().min(1).max(100000).catch(1),
    search: z.string().max(100).catch(""),
    status: z.union([z.enum(goalStatuses), z.literal("")]).catch(""),
    sort: z.enum(["deadline", "progress", "updated"]).catch("deadline"),
  });
  const query = querySchema.parse(paramsQuery);
  const [initial, references, actions] = await Promise.all([
    listGoals(user.id, query.page, query.search, query.status, query.sort),
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
