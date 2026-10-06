"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { getSessions } from "@/lib/mock";
import { updateWorkspace, useWorkspace } from "@/lib/mock/store";
import { localDay } from "@/lib/analytics";
import type { StudySession, Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import Field from "@/components/studyflow/FormFields";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import StudySelectors from "./StudySelectors";
import SessionTable from "./SessionTable";
import SessionModal from "./SessionModal";
interface Props { initial: Workspace }
/** Filterable study history with manual corrections. */
export default function StudyHistory({ initial }: Props) {
  const data = useWorkspace(initial); const t = useTranslations("studyflow"); const modal = useModal();
  const [subject, setSubject] = useState(""); const [topic, setTopic] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [editing, setEditing] = useState<StudySession>(); const [deleting, setDeleting] = useState<StudySession>();
  const sessions = getSessions(data).filter((session) => { const day = localDay(session.startedAt, data.user.timezone); return (!subject || session.subjectId === subject) && (!topic || session.topicId === topic) && (!from || day >= from) && (!to || day <= to); });
  return <><PageHeader title={t("studyHistory")} description={t("historyDescription")} action={<Button onClick={() => { setEditing(undefined); modal.openModal(); }}>{t("addManualSession")}</Button>}/><div className="mb-6 space-y-4"><StudySelectors data={data} subjectId={subject} topicId={topic} onSubjectChange={setSubject} onTopicChange={setTopic} includeArchived/><div className="grid gap-4 sm:grid-cols-2"><Field label={t("fromDate")} type="date" value={from} onChange={(event) => setFrom(event.target.value)}/><Field label={t("toDate")} type="date" value={to} onChange={(event) => setTo(event.target.value)}/></div></div><ComponentCard title={t("sessions")}><SessionTable sessions={sessions} data={data} onEdit={(session) => { setEditing(session); modal.openModal(); }} onDelete={setDeleting}/></ComponentCard>{modal.isOpen && <SessionModal key={editing?.id ?? "new"} data={data} session={editing} isOpen onClose={modal.closeModal}/>}<ConfirmDialog isOpen={Boolean(deleting)} onClose={() => setDeleting(undefined)} title={t("deleteSession")} description={t("deleteSessionWarning")} onConfirm={() => updateWorkspace(initial, (state) => ({ ...state, sessions: state.sessions.filter((session) => session.id !== deleting?.id) }))}/></>;
}
