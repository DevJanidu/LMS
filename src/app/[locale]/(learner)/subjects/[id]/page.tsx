import { requireLearner } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import { getWorkspace } from "@/lib/services/workspace";
import SubjectDetail from "@/components/subjects/SubjectDetail";
import { uuidSchema } from "@/lib/validation";
import { notFound } from "next/navigation";
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireLearner();
  const data = await getWorkspace();
  if (!uuidSchema.safeParse(id).success || !data.subjects.some(subject => subject.id === id)) notFound();
  return <SubjectDetail initial={data} id={id} />;
}
