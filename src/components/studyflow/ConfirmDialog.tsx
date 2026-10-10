"use client";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { useTranslations } from "next-intl";
import { useState } from "react";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | boolean | Promise<void | boolean>;
  title: string;
  description: string;
  /** Security-sensitive changes keep the confirmation dialog until accepted. */
  background?: boolean;
}
/** Confirmation for destructive actions. */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  background = true,
}: Props) {
  const t = useTranslations("studyflow");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="mb-6 text-body text-secondary dark:text-secondary">
        {description}
      </p>
      {error && <p role="alert" className="mb-4 text-body text-error-600 dark:text-error-400">{t("saveFailed")}</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          disabled={pending}
          onClick={async () => {
            setError(false);
            if (background) {
              try {
                const request = onConfirm();
                onClose();
                await request;
              } catch { setError(true); }
              // A completed background request must not close a newer dialog.
              return;
            }
            setPending(true);
            try { const saved = await onConfirm(); if (saved !== false) onClose(); }
            catch { setError(true); }
            finally { setPending(false); }
          }}
        >
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
