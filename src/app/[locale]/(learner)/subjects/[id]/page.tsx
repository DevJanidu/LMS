import { requireLearner } from "@/lib/auth";
import { setRequestLocale } from "next-intl/server";
import { subjectDetailWorkspace, subjectPageWorkspace } from "@/lib/services/focused-workspace";
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
  const account = await requireLearner();
  if (!uuidSchema.safeParse(id).success) notFound();
  if (!(await subjectPageWorkspace(account)).subjects.some(subject => subject.id === id)) notFound();
  const data = await subjectDetailWorkspace(account, id);
  if (!uuidSchema.safeParse(id).success || !data.subjects.some(subject => subject.id === id)) notFound();
  return <SubjectDetail initial={data} id={id} />;
}
