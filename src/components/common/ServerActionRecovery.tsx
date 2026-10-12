"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { SERVER_ACTION_UPDATE_EVENT } from "@/lib/client/server-actions";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";

/** Mounted once so action callers can retain their own form and pending state. */
export default function ServerActionRecovery() {
  const t = useTranslations("studyflow");
  const { isOpen, openModal, closeModal } = useModal();
  useEffect(() => {
    window.addEventListener(SERVER_ACTION_UPDATE_EVENT, openModal);
    return () =>
      window.removeEventListener(SERVER_ACTION_UPDATE_EVENT, openModal);
  }, [openModal]);
  return (
    <Modal isOpen={isOpen} onClose={closeModal} title={t("appUpdatedTitle")}>
      <p className="text-secondary dark:text-secondary mb-6 text-body">
        {t("appUpdatedDescription")}
      </p>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" onClick={closeModal}>
          {t("close")}
        </Button>
        <Button onClick={() => window.location.reload()}>
          {t("refreshPage")}
        </Button>
      </div>
    </Modal>
  );
}
