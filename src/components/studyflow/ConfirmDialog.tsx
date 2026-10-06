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
}
/** Confirmation for destructive actions. */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
}: Props) {
  const t = useTranslations("studyflow");
  const [pending, setPending] = useState(false);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
        {description}
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          disabled={pending}
          onClick={async () => {
            setPending(true);
            try { const saved = await onConfirm(); if (saved !== false) onClose(); }
            finally { setPending(false); }
          }}
        >
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
