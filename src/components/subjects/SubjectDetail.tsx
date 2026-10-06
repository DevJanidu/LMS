"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useModal } from "@/hooks/useModal";
import { getSessions, getSubjects, getTopics } from "@/lib/mock";
import { updateWorkspace, useWorkspace } from "@/lib/mock/store";
import { subjectProgress, totalSeconds } from "@/lib/analytics";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import ProgressBar from "@/components/studyflow/ProgressBar";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { primaryLink } from "@/components/studyflow/WorkspaceShell";
import SessionTable from "@/components/study/SessionTable";
import Resources from "@/components/resources/Resources";
import TopicList from "./TopicList";
import SubjectModal from "./SubjectModal";
interface Props { initial: Workspace; id: string }
/** Live subject overview with focused topics/resources/sessions sections. */
export default function SubjectDetail({ initial, id }: Props) {
  const data = useWorkspace(initial); const t = useTranslations("studyflow"); const locale = useLocale(); const router = useRouter();
  const subject = getSubjects(data).find((item) => item.id === id); const topics = getTopics(data, id); const sessions = getSessions(data).filter((session) => session.subjectId === id);
  const [tab, setTab] = useState("topics"); const [action, setAction] = useState<"delete" | "archive">(); const editor = useModal();
  if (!subject) return <EmptyState title={t("subjectMissing")} description={t("subjectMissingHelp")} action={<Link href="/subjects" className={primaryLink}>{t("subjects")}</Link>}/>;
  return <><PageHeader title={subject.title} description={subject.description} action={<Link href={`/study?subject=${id}`} className={primaryLink}>{t("startStudying")}</Link>}/><div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3"><div className="mb-3 flex flex-wrap justify-between gap-3 text-sm"><span>{subjectProgress(topics)}% · {t("topicCount", { completed: topics.filter((topic) => topic.status === "completed").length, total: topics.length })}</span><span>{duration(totalSeconds(sessions))}{subject.targetDate && ` · ${t("targetDate")}: ${formatDate(subject.targetDate, data.user.timezone, locale)}`}</span></div><ProgressBar value={subjectProgress(topics)} label={subject.title} color={subject.color}/><div className="mt-5 flex flex-wrap gap-3"><Button variant="outline" size="sm" onClick={editor.openModal}>{t("editSubject")}</Button><Button variant="outline" size="sm" onClick={() => setAction("archive")}>{t(subject.status === "archived" ? "restore" : "archive")}</Button><Button variant="outline" size="sm" onClick={() => setAction("delete")}>{t("delete")}</Button></div></div><div className="mb-5 flex gap-1 border-b border-gray-200 dark:border-gray-800" role="tablist" aria-label={t("subjectSections")}>{["topics", "resources", "sessions"].map((key) => <button key={key} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} onClick={() => setTab(key)} className={`border-b-2 px-5 py-3 text-sm ${tab === key ? "border-brand-500 text-brand-600 dark:border-brand-400 dark:text-brand-300" : "border-transparent text-gray-500 dark:text-gray-400"}`}>{t(key)}</button>)}</div><div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>{tab === "topics" && <ComponentCard title={t("topics")}><TopicList data={data} subjectId={id}/></ComponentCard>}{tab === "resources" && <Resources initial={initial} subjectId={id} embedded/>}{tab === "sessions" && <ComponentCard title={t("sessions")}><SessionTable sessions={sessions} data={data}/></ComponentCard>}</div><SubjectModal initial={initial} subject={subject} isOpen={editor.isOpen} onClose={editor.closeModal}/><ConfirmDialog isOpen={Boolean(action)} onClose={() => setAction(undefined)} title={t(action === "delete" ? "deleteSubject" : subject.status === "archived" ? "restore" : "archiveSubject")} description={t(action === "delete" ? "deleteSubjectWarning" : "archiveWarning")} onConfirm={() => { updateWorkspace(initial, (state) => action === "delete" ? { ...state, subjects: state.subjects.filter((item) => item.id !== id), topics: state.topics.filter((item) => item.subjectId !== id), sessions: state.sessions.filter((item) => item.subjectId !== id), resources: state.resources.filter((item) => item.subjectId !== id), blocks: state.blocks.filter((item) => item.subjectId !== id), timer: state.timer?.subjectId === id ? null : state.timer } : { ...state, subjects: state.subjects.map((item) => item.id === id ? { ...item, status: item.status === "active" ? "archived" : "active" } : item) }); if (action === "delete") router.push("/subjects"); }}/></>;
}
