"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import Button from "@/components/ui/button/Button";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import type { GoalMutation } from "@/lib/goals/validation";
import { localDay } from "@/lib/analytics";
interface Props {
  detail: GoalDetail;
  references: GoalReferences;
  mode: "activity" | "session";
  onClose: () => void;
  onSave: (action: GoalMutation["action"]) => Promise<void>;
}
export default function GoalActivityEditor({
  detail,
  references,
  mode,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("goals"),
    [kind, setKind] = useState("quantity"),
    [sessionId, setSessionId] = useState(references.sessions[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const session = references.sessions.find((s) => s.id === sessionId);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(mode === "session" ? "linkSession" : "addActivity")}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const fields = new FormData(event.currentTarget);
          setBusy(true);
          try {
            const taskId = String(fields.get("taskId") ?? "") || null;
            await onSave(
              mode === "session"
                ? {
                    kind: "linkSession",
                    sessionId,
                    taskId,
                    seconds: Math.round(Number(fields.get("minutes")) * 60),
                  }
                : {
                    kind: "activity",
                    taskId,
                    type: kind as
                      "quantity" | "outcome" | "habit" | "reflection",
                    amount:
                      kind === "outcome"
                        ? 1
                        : Number(fields.get("amount") ?? 0),
                    evidence: String(fields.get("evidence")),
                    date: String(fields.get("date")),
                  },
            );
          } catch (error) {
            const key = (error as Error).message;
            setError(
              t.has(`errors.${key}`)
                ? t(`errors.${key}`)
                : t("errors.serviceUnavailable"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {mode === "session" ? (
          <>
            <p className="text-secondary dark:text-secondary text-small">
              {t("sessionAllocationHelp")}
            </p>
            <SelectField
              label={t("recentSessions")}
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">{t("none")}</option>
              {references.sessions.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                >{`${localDay(s.startedAt, references.timezone)} · ${references.subjects.find((subject) => subject.id === s.subjectId)?.title ?? ""} · ${Math.round(s.durationSeconds / 60)}`}</option>
              ))}
            </SelectField>
            <Field
              key={sessionId}
              label={t("fields.allocatedMinutes")}
              name="minutes"
              type="number"
              required
              min={1}
              max={Math.ceil((session?.durationSeconds ?? 0) / 60)}
              defaultValue={Math.floor((session?.durationSeconds ?? 0) / 60)}
            />
          </>
        ) : (
          <>
            <SelectField
              label={t("fields.activityType")}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {["quantity", "outcome", "reflection"].map((key) => (
                <option key={key} value={key}>
                  {t(`activityTypes.${key}`)}
                </option>
              ))}
            </SelectField>
            {kind === "quantity" && (
              <Field
                label={t("fields.amount")}
                name="amount"
                type="number"
                min={1}
                required
                defaultValue={1}
              />
            )}
            <Field
              label={t("fields.date")}
              name="date"
              type="date"
              required
              defaultValue={localDay(Date.now(), references.timezone)}
            />
            <TextField label={t("fields.evidence")} name="evidence" required />
          </>
        )}
        <SelectField label={t("task")} name="taskId">
          <option value="">{t("none")}</option>
          {detail.tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </SelectField>
        {error && (
          <p
            role="alert"
            className="text-small text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <Button
          type="submit"
          disabled={busy || (mode === "session" && !sessionId)}
        >
          {t(busy ? "saving" : "save")}
        </Button>
      </form>
    </Modal>
  );
}
