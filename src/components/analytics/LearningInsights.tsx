"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSubjects, getTopics, getSessions } from "@/lib/workspace/queries";
import { subjectProgress, weeklyGoalPercent } from "@/lib/analytics";
import type { Workspace } from "@/types";
import ProgressBar from "@/components/studyflow/ProgressBar";
import ComponentCard from "@/components/common/ComponentCard";
interface Props {data:Workspace; weeklySeconds:number}
export default function LearningInsights({data,weeklySeconds}:Props) {
  const t = useTranslations("studyflow");
  const sessions = getSessions(data);
  const subjects = getSubjects(data).filter(s=>s.status==="active");
  const progress = (id: string) => data.subjectStatistics?.[id]?.progress ?? subjectProgress(getTopics(data,id));
  const last = (id: string) => data.subjectStatistics?.[id]?.lastStudiedAt ?? sessions.find(s=>s.subjectId===id)?.startedAt ?? "";
  const attention = subjects.filter(s=>progress(s.id)<100).sort((a,b)=>last(a.id).localeCompare(last(b.id))).slice(0,3);
  return <div className="mt-6 grid gap-6 lg:grid-cols-2"><ComponentCard title={t("redesign.completedProgress")}>{subjects.map(subject=><div key={subject.id}><div className="mb-2 flex justify-between gap-3 text-sm"><Link href={`/subjects/${subject.id}`}>{subject.title}</Link><span>{progress(subject.id)}%</span></div><ProgressBar value={progress(subject.id)} label={subject.title}/></div>)}<div className="border-t border-gray-200 pt-5 dark:border-gray-800"><p className="mb-3 text-sm font-medium">{t("weeklyGoal")}</p><ProgressBar value={weeklyGoalPercent(weeklySeconds/60,data.user.weeklyTargetMinutes)} label={t("weeklyGoal")}/></div></ComponentCard><ComponentCard title={t("redesign.attention")} desc={t("redesign.attentionHelp")}>{attention.length ? attention.map(subject=><Link key={subject.id} href={`/subjects/${subject.id}`} className="sf-agenda-item"><span className="flex-1 text-sm font-medium">{subject.title}</span><span className="text-sm text-brand-600 dark:text-brand-300">{t("continue")} →</span></Link>) : <p className="text-sm text-muted">{t(subjects.length?"redesign.allComplete":"noSubjectsHelp")}</p>}</ComponentCard></div>;
}
