"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { TextField } from "@/components/studyflow/FormFields";
import { runOperation, useWorkspacePending } from "@/lib/workspace/store";
import type { Workspace } from "@/types";
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
    [error, setError] = useState("");
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
          const result = await runOperation(initial, {
            kind: "timer",
            value: { command: "finish", note: note || undefined },
          });
          if (!result.ok) {
            setError(t(result.error));
            return;
          }
          onSaved?.(result.timerResult === "saved");
          onClose();
        }}
      >
        <TextField label={t("noteOptional")} name="note" maxLength={20000} />
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
