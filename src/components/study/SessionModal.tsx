"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Field, { TextField } from "@/components/studyflow/FormFields";
import { newId, updateWorkspace } from "@/lib/mock/store";
import { wallTime, zonedToUtc } from "@/lib/analytics";
import type { StudySession, Workspace } from "@/types";
import StudySelectors from "./StudySelectors";
interface Props { data: Workspace; session?: StudySession; isOpen: boolean; onClose: () => void }
/** Manual session editor using local input and UTC storage. */
export default function SessionModal({ data, session, isOpen, onClose }: Props) {
  const t = useTranslations("studyflow"); const [subjectId, setSubjectId] = useState(session?.subjectId ?? ""); const [topicId, setTopicId] = useState(session?.topicId ?? ""); const [error, setError] = useState("");
  return <Modal isOpen={isOpen} onClose={onClose} title={t(session ? "editSession" : "addManualSession")}><form className="space-y-4" onSubmit={(event) => {
    event.preventDefault(); const fields = new FormData(event.currentTarget); const minutes = Number(fields.get("minutes")); const startedAt = zonedToUtc(String(fields.get("start")), data.user.timezone); const end = Date.parse(startedAt) + minutes * 60000;
    if (minutes < 1 || minutes > 1440 || end > Date.now()) { setError(t("invalidSession")); return; }
    const value: StudySession = { id: session?.id ?? newId(), userId: data.user.id, subjectId, topicId: topicId || undefined, startedAt, endedAt: new Date(end).toISOString(), durationSeconds: Math.round(minutes * 60), status: "valid", note: String(fields.get("note")) || undefined, source: session?.source ?? "manual", createdAt: session?.createdAt ?? new Date().toISOString() };
    updateWorkspace(data, (state) => ({ ...state, sessions: session ? state.sessions.map((item) => item.id === session.id ? value : item) : [...state.sessions, value] })); onClose();
  }}><StudySelectors data={data} subjectId={subjectId} topicId={topicId} onSubjectChange={setSubjectId} onTopicChange={setTopicId} includeArchived/><Field label={t("startLocal", { timezone: data.user.timezone })} type="datetime-local" name="start" required defaultValue={session ? wallTime(session.startedAt, data.user.timezone) : undefined}/><Field label={t("minutes")} name="minutes" type="number" min={1} max={1440} required defaultValue={session ? session.durationSeconds / 60 : 30}/><TextField label={t("noteOptional")} name="note" defaultValue={session?.note}/>{error && <p role="alert" className="text-sm text-error-600 dark:text-error-400">{error}</p>}<Button type="submit" disabled={!subjectId}>{t("saveSession")}</Button></form></Modal>;
}
