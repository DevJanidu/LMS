import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOnboardedLearner } from "@/lib/auth";
import { currentCompetitionWeek } from "@/lib/circles/policy";
import FriendProfile from "@/components/circles/FriendProfile";

/** The API decides what is visible; a private profile renders a clear "private" state. */
export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireOnboardedLearner();
  if (!z.uuid().safeParse(id).success || id === user.id) notFound();
  return <FriendProfile friendId={id} currentWeek={currentCompetitionWeek()} />;
}
