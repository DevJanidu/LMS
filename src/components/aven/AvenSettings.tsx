"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/Checkbox";
import { TimePickerField } from "@/components/form/DatePickerField";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import RepeatWeekdays from "@/components/calendar/RepeatWeekdays";
import { featureRequest } from "@/lib/goals/client";
import type { avenBootstrap } from "@/lib/aven/conversations";
import {
  aiPreferenceSchema,
  notificationPreferenceSchema,
} from "@/lib/aven/validation";
type Preferences = Awaited<ReturnType<typeof avenBootstrap>>["preferences"];
interface Props {
  initial: Preferences;
  onSaved: (preferences: Preferences) => void;
}
export default function AvenSettings({ initial, onSaved }: Props) {
  const t = useTranslations("aven"),
    [ai, setAi] = useState(initial.ai),
    [notifications, setNotifications] = useState(initial.notifications),
    [memory, setMemory] = useState(initial.memory),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const apply = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const result = await featureRequest<{ preferences: Preferences }>(
        "/api/aven",
        body,
      );
      setMemory(result.preferences.memory);
      onSaved(result.preferences);
      setNotice(t("saved"));
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
  };
  const push = async () => {
    try {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !initial.publicPushKey
      )
        throw new Error("pushUnavailable");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("pushPermissionDenied");
      const registration =
        await navigator.serviceWorker.register("/aven-sw.js");
      const raw = atob(
          initial.publicPushKey.replace(/-/g, "+").replace(/_/g, "/"),
        ),
        key = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      await featureRequest("/api/aven/push", {
        kind: "subscribe",
        subscription: subscription.toJSON(),
      });
      setNotifications((current) => ({ ...current, push: true }));
      setNotice(t("pushEnabled"));
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`)
          ? t(`errors.${key}`)
          : t("errors.pushUnavailable"),
      );
    }
  };
  return (
    <div className="space-y-5">
      <ComponentCard title={t("settings")}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const aiValue = aiPreferenceSchema.safeParse(ai),
              notificationValue =
                notificationPreferenceSchema.safeParse(notifications);
            if (!aiValue.success || !notificationValue.success) {
              setError(t("errors.invalidInput"));
              return;
            }
            void apply({
              kind: "preferences",
              ai: aiValue.data,
              notifications: notificationValue.data,
            });
          }}
        >
          <p className="text-secondary dark:text-secondary text-small">
            {t("privacyHelp")}
          </p>
          <label className="text-primary dark:text-primary flex items-center gap-2 text-small">
            <Checkbox
              className="!min-h-0 !min-w-0"
              checked={ai.consent}
              onCheckedChange={(checked) =>
                setAi((current) => ({ ...current, consent: checked === true }))
              }
            />
            {t("settingsFields.consent")}
          </label>
          <SelectField
            label={t("settingsFields.coachingStyle")}
            value={ai.coachingStyle}
            onChange={(e) =>
              setAi((current) => ({
                ...current,
                coachingStyle: e.target.value as typeof ai.coachingStyle,
              }))
            }
          >
            {["supportive", "direct", "analytical"].map((key) => (
              <option key={key} value={key}>
                {t(`styles.${key}`)}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <TimePickerField
              label={t("settingsFields.preferredStudyStart")}
              value={ai.preferredStudyStart}
              onChange={(value) =>
                setAi((current) => ({ ...current, preferredStudyStart: value }))
              }
            />
            <TimePickerField
              label={t("settingsFields.preferredStudyEnd")}
              value={ai.preferredStudyEnd}
              onChange={(value) =>
                setAi((current) => ({ ...current, preferredStudyEnd: value }))
              }
            />
          </div>
          <Field
            label={t("settingsFields.dailyTargetMinutes")}
            type="number"
            min={15}
            max={240}
            value={ai.dailyTargetMinutes}
            onChange={(e) =>
              setAi((current) => ({
                ...current,
                dailyTargetMinutes: Number(e.target.value),
              }))
            }
          />
          <RepeatWeekdays
            weekdays={ai.studyDays}
            onChange={(value) =>
              setAi((current) => ({ ...current, studyDays: value }))
            }
          />
          <TextField
            label={t("settingsFields.learningPreferences")}
            value={ai.learningPreferences}
            onChange={(e) =>
              setAi((current) => ({
                ...current,
                learningPreferences: e.target.value,
              }))
            }
          />
          <label className="text-primary dark:text-primary flex items-center gap-2 text-small">
            <Checkbox
              className="!min-h-0 !min-w-0"
              checked={ai.allowResourceContent}
              onCheckedChange={(checked) =>
                setAi((current) => ({
                  ...current,
                  allowResourceContent: checked === true,
                }))
              }
            />
            {t("settingsFields.allowResourceContent")}
          </label>
          <SelectField
            label={t("settingsFields.locale")}
            value={ai.locale}
            onChange={(e) =>
              setAi((current) => ({
                ...current,
                locale: e.target.value as typeof ai.locale,
              }))
            }
          >
            {["en", "ar", "es", "de"].map((key) => (
              <option key={key} value={key}>
                {t(`languages.${key}`)}
              </option>
            ))}
          </SelectField>
          <h3 className="text-primary dark:text-primary pt-3 text-h3">
            {t("notificationSettings")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                "enabled",
                "inApp",
                "email",
                "push",
                "morning",
                "sessionReminders",
                "missedSessions",
                "goalReminders",
                "randomized",
                "evening",
                "weekly",
              ] as const
            ).map((key) => (
              <label
                key={key}
                className="text-primary dark:text-primary flex items-center gap-2 text-small"
              >
                <Checkbox
                  className="!min-h-0 !min-w-0"
                  checked={notifications[key]}
                  disabled={
                    (key === "email" && !initial.emailConfigured) ||
                    (key === "push" && !initial.pushConfigured)
                  }
                  onCheckedChange={(checked) =>
                    setNotifications((current) => ({
                      ...current,
                      [key]: checked === true,
                    }))
                  }
                />
                {t(`settingsFields.${key}`)}
              </label>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                "morningTime",
                "eveningTime",
                "quietStart",
                "quietEnd",
                "allowedStart",
                "allowedEnd",
              ] as const
            ).map((key) => (
              <TimePickerField
                key={key}
                label={t(`settingsFields.${key}`)}
                value={notifications[key]}
                onChange={(value) =>
                  setNotifications((current) => ({ ...current, [key]: value }))
                }
              />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                "leadMinutes",
                "graceMinutes",
                "dailyLimit",
                "inactivityDays",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={t(`settingsFields.${key}`)}
                type="number"
                min={key === "leadMinutes" ? 0 : 1}
                value={notifications[key]}
                onChange={(e) =>
                  setNotifications((current) => ({
                    ...current,
                    [key]: Number(e.target.value),
                  }))
                }
              />
            ))}
          </div>
          <SelectField
            label={t("settingsFields.weeklyDay")}
            value={String(notifications.weeklyDay)}
            onChange={(e) =>
              setNotifications((current) => ({
                ...current,
                weeklyDay: Number(e.target.value),
              }))
            }
          >
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <option key={day} value={String(day)}>
                {t(`days.d${day}`)}
              </option>
            ))}
          </SelectField>
          {notifications.snoozedUntil && (
            <p className="text-secondary dark:text-secondary text-small">
              {t("snoozedUntil", {
                date: new Date(notifications.snoozedUntil).toLocaleString(),
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {t(busy ? "saving" : "saveSettings")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const value = {
                  ...notifications,
                  snoozedUntil: new Date(Date.now() + 86400000).toISOString(),
                };
                setNotifications(value);
                void apply({ kind: "preferences", ai, notifications: value });
              }}
            >
              {t("snoozeDay")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                const value = { ...notifications, snoozedUntil: null };
                setNotifications(value);
                void apply({ kind: "preferences", ai, notifications: value });
              }}
            >
              {t("resumeReminders")}
            </Button>
          </div>
          {initial.pushConfigured && (
            <Button
              variant="outline"
              onClick={() => {
                void push();
              }}
            >
              {t("enablePush")}
            </Button>
          )}
          {!initial.emailConfigured && (
            <p className="text-muted dark:text-muted text-caption">
              {t("emailUnavailable")}
            </p>
          )}
          <p className="text-muted dark:text-muted text-caption">
            {t("budgetSummary", {
              used: initial.budget.usedUsd.toFixed(2),
              limit: initial.budget.monthlyUsd.toFixed(2),
            })}
          </p>
          {!initial.budget.dailyLimitEnabled && (
            <p className="text-muted dark:text-muted text-caption">
              {t("noDailyChatLimit")}
            </p>
          )}
          <p className="text-muted dark:text-muted text-caption">
            {t("usage", {
              tokens: Number(initial.usage.tokens),
              cost: (Number(initial.usage.costMicros) / 1e6).toFixed(2),
            })}
          </p>
          {notice && (
            <p
              role="status"
              className="text-small text-success-600 dark:text-success-400"
            >
              {notice}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="text-small text-error-600 dark:text-error-400"
            >
              {error}
            </p>
          )}
        </form>
      </ComponentCard>
      <ComponentCard title={t("memory")}>
        <p className="text-secondary dark:text-secondary mb-4 text-small">
          {t("memoryHelp")}
        </p>
        {memory.map((item) => (
          <form
            key={item.id}
            className="mb-4 space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void apply({
                kind: "memory",
                id: item.id,
                content: String(
                  new FormData(event.currentTarget).get("content"),
                ),
              });
            }}
          >
            <TextField
              label={t("memoryEntry")}
              name="content"
              defaultValue={item.content}
              maxLength={2000}
              required
            />
            <div className="flex gap-2">
              <Button type="submit" variant="outline" disabled={busy}>
                {t("save")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  void apply({ kind: "deleteMemory", id: item.id });
                }}
              >
                {t("delete")}
              </Button>
            </div>
          </form>
        ))}
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void apply({
              kind: "memory",
              id: crypto.randomUUID(),
              content: String(new FormData(form).get("content")),
            }).then(() => form.reset());
          }}
        >
          <TextField
            label={t("addMemory")}
            name="content"
            required
            maxLength={2000}
          />
          <Button type="submit" disabled={busy}>
            {t("addMemory")}
          </Button>
        </form>
      </ComponentCard>
    </div>
  );
}
