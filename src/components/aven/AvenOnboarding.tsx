"use client";
import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useModal } from "@/hooks/useModal";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/Checkbox";
import Button from "@/components/ui/button/Button";
import { featureRequest } from "@/lib/goals/client";
import { subscribeToPush } from "./browserPush";
import type { Preferences } from "./types";
interface Props {
  preferences: Preferences;
  onDone: (value: Preferences) => void;
}
function Choice({
  checked,
  onChange,
  disabled,
  label,
  help,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  help?: ReactNode;
}) {
  return (
    <label className="text-primary dark:text-primary flex items-start gap-3 text-small">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span>
        {label}
        {help && (
          <span className="text-muted dark:text-muted mt-0.5 block text-caption">
            {help}
          </span>
        )}
      </span>
    </label>
  );
}
/** One-time setup: each permission is a separate, revocable choice. */
export default function AvenOnboarding({ preferences, onDone }: Props) {
  const t = useTranslations("aven"),
    o = useTranslations("aven.onboarding"),
    modal = useModal();
  const [consent, setConsent] = useState(false),
    [reminders, setReminders] = useState(true),
    [push, setPush] = useState(false),
    [email, setEmail] = useState(false),
    [resources, setResources] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const finish = async () => {
    if (!consent || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await featureRequest<{ preferences: Preferences }>(
        "/api/aven",
        {
          kind: "onboard",
          reminders,
          email: reminders && email,
          push: reminders && push,
          resourceContent: resources,
          locale: "en",
        },
      );
      // Permission is requested only after the learner chose push. A refusal keeps setup complete;
      // settings shows the browser permission state and can retry.
      if (reminders && push)
        await subscribeToPush(preferences.publicPushKey).catch(() => {});
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
      <div className="aven-notice">
        <div>
          <p className="text-primary dark:text-primary font-semibold">
            {t("onboardingTitle")}
          </p>
          <p>{t("onboardingIntro")}</p>
        </div>
        <Button
          size="sm"
          disabled={!preferences.configured}
          onClick={modal.openModal}
        >
          {t("getStarted")}
        </Button>
      </div>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        title={t("onboardingTitle")}
        size="wide"
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-primary dark:text-primary text-h3">
              {o("dataTitle")}
            </h3>
            <p className="text-secondary dark:text-secondary text-small">
              {t("privacyHelp")}
            </p>
            <Choice
              checked={consent}
              onChange={setConsent}
              label={t("onboardingConsent")}
              help={o("consentRequired")}
            />
          </section>
          <section className="space-y-3">
            <h3 className="text-primary dark:text-primary text-h3">
              {o("remindersTitle")}
            </h3>
            <p className="text-secondary dark:text-secondary text-small">
              {o("remindersHelp")}
            </p>
            <Choice
              checked={reminders}
              onChange={setReminders}
              label={t("onboardingReminders")}
              help={o("inAppHelp")}
            />
            <Choice
              checked={push}
              onChange={setPush}
              disabled={!reminders || !preferences.pushConfigured}
              label={o("push")}
              help={o(
                preferences.pushConfigured ? "pushHelp" : "pushUnavailable",
              )}
            />
            <Choice
              checked={email}
              onChange={setEmail}
              disabled={!reminders || !preferences.emailConfigured}
              label={o("email")}
              help={o(
                preferences.emailConfigured ? "emailHelp" : "emailUnavailable",
              )}
            />
          </section>
          <section className="space-y-3">
            <h3 className="text-primary dark:text-primary text-h3">
              {o("resourcesTitle")}
            </h3>
            <Choice
              checked={resources}
              onChange={setResources}
              label={t("settingsFields.allowResourceContent")}
              help={o("resourcesHelp")}
            />
          </section>
          <p className="text-muted dark:text-muted text-caption">
            {o("changeLater")}
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
