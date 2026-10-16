"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { TextField } from "@/components/studyflow/FormFields";
import { runOperation, useWorkspacePending } from "@/lib/workspace/store";
import type { Workspace } from "@/types";
import ConfidenceCheck, { type ConfidenceChoice } from "./ConfidenceCheck";
/** The optional confidence report never blocks saving the session itself. */
async function reportConfidence(
  subjectId: string,
  topicId: string | null,
  level: Exclude<ConfidenceChoice, "skip">,
) {
  await fetch("/api/learning/signals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "report", subjectId, topicId, level }),
  }).catch(() => undefined);
}
export default function FinishStudyDialog({
  initial,
  isOpen,
  onClose,
  onSaved,
}: {
  initial: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (saved: boolean) => void;
}) {
  const t = useTranslations("studyflow"),
    pending = useWorkspacePending("timer"),
    [error, setError] = useState(""),
    [confidence, setConfidence] = useState<ConfidenceChoice>("skip");
  return (
    <Modal isOpen={isOpen} onClose={pending ? () => {} : onClose} title={t("whatStudied")}>
      <form
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const note = String(
            new FormData(event.currentTarget).get("note") ?? "",
          ).trim();
          const timer = initial.timer;
          const result = await runOperation(initial, {
            kind: "timer",
            value: { command: "finish", note: note || undefined },
          });
          if (!result.ok) {
            setError(t(result.error));
            return;
          }
          if (timer && confidence !== "skip" && result.timerResult === "saved")
            await reportConfidence(
              timer.subjectId,
              timer.topicId ?? null,
              confidence,
            );
          setConfidence("skip");
          onSaved?.(result.timerResult === "saved");
          onClose();
        }}
      >
        <TextField label={t("noteOptional")} name="note" maxLength={20000} />
        {initial.timer && (
          <ConfidenceCheck value={confidence} onChange={setConfidence} />
        )}
        {error && (
          <p
            role="alert"
            className="text-small text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {t(pending ? "loading" : "saveSession")}
        </Button>
      </form>
    </Modal>
  );
}
