"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/Checkbox";
import Button from "@/components/ui/button/Button";
import { featureRequest } from "@/lib/goals/client";
import type { avenBootstrap } from "@/lib/aven/conversations";
type Preferences = Awaited<ReturnType<typeof avenBootstrap>>["preferences"];
export default function AvenOnboarding({
  available,
  onDone,
}: {
  available: boolean;
  onDone: (value: Preferences) => void;
}) {
  const t = useTranslations("aven"),
    locale = useLocale(),
    modal = useModal();
  const [consent, setConsent] = useState(false),
    [reminders, setReminders] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const finish = async () => {
    if (!consent || busy) return;
    setBusy(true);
    try {
      const result = await featureRequest<{ preferences: Preferences }>(
        "/api/aven",
        { kind: "onboard", reminders, locale },
      );
      onDone(result.preferences);
      modal.closeModal();
    } catch {
      setError(t("errors.serviceUnavailable"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="text-secondary dark:text-secondary rounded-xl bg-brand-50 p-4 text-small dark:bg-brand-950/30">
        <p className="text-primary dark:text-primary mb-2 font-semibold">
          {t("onboardingTitle")}
        </p>
        <p>{t("onboardingIntro")}</p>
        <Button
          className="mt-3"
          disabled={!available}
          onClick={modal.openModal}
        >
          {t("getStarted")}
        </Button>
      </div>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        title={t("onboardingTitle")}
      >
        <div className="space-y-5">
          <p className="text-secondary dark:text-secondary text-body">
            {t("privacyHelp")}
          </p>
          <label className="text-primary dark:text-primary flex items-start gap-3 text-small">
            <Checkbox
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
            />
            {t("onboardingConsent")}
          </label>
          <label className="text-primary dark:text-primary flex items-start gap-3 text-small">
            <Checkbox
              checked={reminders}
              onCheckedChange={(checked) => setReminders(checked === true)}
            />
            {t("onboardingReminders")}
          </label>
          <p className="text-muted dark:text-muted text-caption">
            {t("onboardingPermissions")}
          </p>
          {error && (
            <p
              role="alert"
              className="text-small text-error-600 dark:text-error-400"
            >
              {error}
            </p>
          )}
          <Button
            disabled={!consent || busy}
            onClick={() => {
              void finish();
            }}
          >
            {t(busy ? "saving" : "finishSetup")}
          </Button>
        </div>
      </Modal>
    </>
  );
}
