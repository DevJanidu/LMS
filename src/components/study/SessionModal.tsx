"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Field, { TextField } from "@/components/studyflow/FormFields";
import { newId, runOperation } from "@/lib/workspace/store";
import { wallTime, zonedToUtc } from "@/lib/analytics";
import type { StudySession, Workspace } from "@/types";
import StudySelectors from "./StudySelectors";
interface Props {
  data: Workspace;
  session?: StudySession;
  isOpen: boolean;
  onClose: () => void;
}
/** Manual session editor using local input and UTC storage. */
export default function SessionModal({
  data,
  session,
  isOpen,
  onClose,
}: Props) {
  const t = useTranslations("studyflow");
  const [subjectId, setSubjectId] = useState(session?.subjectId ?? "");
  const [topicId, setTopicId] = useState(session?.topicId ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(session ? "editSession" : "addManualSession")}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const minutes = Number(fields.get("minutes"));
          const enteredStart = String(fields.get("start"));
          let startedAt: string;
          try { startedAt = session && enteredStart === wallTime(session.startedAt, data.user.timezone) ? session.startedAt : zonedToUtc(enteredStart, data.user.timezone); }
          catch { setError(t("invalidSession")); return; }
          const end = Date.parse(startedAt) + minutes * 60000;
          if (
            !Number.isFinite(minutes) ||
            minutes < 1 ||
            !Number.isFinite(end) ||
            end > Date.now()
          ) {
            setError(t("invalidSession"));
            return;
          }
          const value: StudySession = {
            id: session?.id ?? newId(),
            userId: data.user.id,
            subjectId,
            topicId: topicId || undefined,
            startedAt,
            endedAt: session && startedAt === session.startedAt && Math.round(minutes * 60) === session.durationSeconds ? session.endedAt : new Date(end).toISOString(),
            durationSeconds: Math.round(minutes * 60),
            status: "valid",
            note: String(fields.get("note")) || undefined,
            source: session?.source ?? "manual",
            createdAt: session?.createdAt ?? new Date().toISOString(),
          };
          setPending(true);
          const result = await runOperation(data, { kind: "session", value });
          setPending(false);
          if (result.ok) onClose(); else setError(t(result.error));
        }}
      >
        <StudySelectors
          data={data}
          subjectId={subjectId}
          topicId={topicId}
          onSubjectChange={setSubjectId}
          onTopicChange={setTopicId}
          includeArchived
        />
        <Field
          label={t("startLocal", { timezone: data.user.timezone })}
          type="datetime-local"
          name="start"
          required
          defaultValue={
            session
              ? wallTime(session.startedAt, data.user.timezone)
              : undefined
          }
        />
        <Field
          label={t("minutes")}
          name="minutes"
          type="number"
          step="any"
          min={1}
          required
          defaultValue={session ? session.durationSeconds / 60 : 30}
        />
        <TextField
          label={t("noteOptional")}
          name="note"
          defaultValue={session?.note}
        />
        {error && (
          <p
            role="alert"
            className="text-body text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={!subjectId || pending}>
          {t("saveSession")}
        </Button>
      </form>
    </Modal>
  );
}
