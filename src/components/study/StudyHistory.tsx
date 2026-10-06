"use client";
import { useEffect, useState } from "react";
import { querySessions } from "@/app/[locale]/actions";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { runOperation, useWorkspace } from "@/lib/workspace/store";
import type { StudySession, Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import Field from "@/components/studyflow/FormFields";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import StudySelectors from "./StudySelectors";
import SessionTable from "./SessionTable";
import SessionModal from "./SessionModal";
interface Props {
  initial: Workspace;
}
/** Filterable study history with manual corrections. */
export default function StudyHistory({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const modal = useModal();
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<StudySession>();
  const [deleting, setDeleting] = useState<StudySession>();
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<{ total: number; rows: StudySession[] }>({ total: initial.sessions.length, rows: initial.sessions.slice(0, 20) });
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const result = await querySessions({ page, subjectId: subject || undefined, topicId: topic || undefined, from: from || undefined, to: to || undefined });
      if (cancelled) return;
      if (result.ok) { setRecords(result.data); setError(""); } else setError(t(result.error));
    };
    void refresh().catch(() => { if (!cancelled) setError(t("saveFailed")); });
    return () => { cancelled = true; };
  }, [page, subject, topic, from, to, data.sessions, t]);
  const sessions = records.rows;
  const pages = Math.max(1, Math.ceil(records.total / 20));
  return (
    <>
      <PageHeader
        title={t("studyHistory")}
        description={t("historyDescription")}
        action={
          <Button
            onClick={() => {
              setEditing(undefined);
              modal.openModal();
            }}
          >
            {t("addManualSession")}
          </Button>
        }
      />
      <div className="mb-6 space-y-4">
        <StudySelectors
          data={data}
          subjectId={subject}
          topicId={topic}
          onSubjectChange={value => { setSubject(value); setPage(1); }}
          onTopicChange={value => { setTopic(value); setPage(1); }}
          includeArchived
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("fromDate")}
            type="date"
            value={from}
            onChange={(event) => { setFrom(event.target.value); setPage(1); }}
          />
          <Field
            label={t("toDate")}
            type="date"
            value={to}
            onChange={(event) => { setTo(event.target.value); setPage(1); }}
          />
        </div>
      </div>
      <ComponentCard title={t("sessions")}>
        <SessionTable
          sessions={sessions}
          data={data}
          onEdit={(session) => {
            setEditing(session);
            modal.openModal();
          }}
          onDelete={setDeleting}
        />
      </ComponentCard>
      {error && <p role="alert" className="text-error-600 dark:text-error-400">{error}</p>}
      <div className="my-5 flex items-center justify-between gap-3"><span>{t("redesign.pageOf", { page, total: pages })}</span><div className="flex gap-2"><Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("redesign.previous")}</Button><Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("redesign.next")}</Button></div></div>
      {modal.isOpen && (
        <SessionModal
          key={editing?.id ?? "new"}
          data={data}
          session={editing}
          isOpen
          onClose={modal.closeModal}
        />
      )}
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("deleteSession")}
        description={t("deleteSessionWarning")}
        onConfirm={async () => {
          if (!deleting) return;
          const result = await runOperation(initial, { kind: "delete", entity: "session", id: deleting.id });
          if (!result.ok) setError(t(result.error));
        }}
      />
    </>
  );
}
