"use client";
import { useState } from "react";
import { deleteMyAccount } from "@/app/[locale]/actions";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useModal } from "@/hooks/useModal";
import { currentWorkspaceTheme, updateWorkspace, useWorkspace } from "@/lib/workspace/store";
import type { User, Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import { Checkbox } from "@/components/ui/Checkbox";
import ComboboxField from "@/components/form/ComboboxField";
interface Props {
  initial: Workspace;
}
/** Profile, study preferences and account controls. */
export default function Settings({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const router = useRouter();
  const { themeMode, setThemeMode } = useTheme();
  const deletion = useModal();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const save = async (patch: Partial<User>) => {
    const saved = await updateWorkspace(initial, (state) => ({
      ...state,
      user: { ...state.user, ...patch, updatedAt: new Date().toISOString() },
      users: state.users.map((user) =>
        user.id === state.user.id ? { ...user, ...patch } : user,
      ),
    }));
    if (saved) { setMessage(t("settingsSaved")); setError(""); }
    else {
      if (patch.theme !== undefined) setThemeMode(currentWorkspaceTheme(initial));
      setError(t("saveFailed"));
    }
  };
  return (
    <>
      <PageHeader
        title={t("settings")}
        description={t("settingsDescription")}
      />
      <div className="sf-settings-layout"><nav className="sf-settings-nav" aria-label={t("settings")}>{["profile","preferences","notifications","dangerZone"].map(key=><a key={key} href={`#settings-${key}`}>{t(key)}</a>)}</nav><div className="min-w-0 space-y-8">
        <section id="settings-profile"><ComponentCard title={t("profile")}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const timezone = String(fields.get("timezone")).trim();
              const name = String(fields.get("name")).trim();
              if (!name) {
                setError(t("nameRequired"));
                return;
              }
              try {
                new Intl.DateTimeFormat("en", { timeZone: timezone });
              } catch {
                setError(t("invalidTimezone"));
                return;
              }
              setError("");
              save({ name, email: String(fields.get("email")), timezone });
            }}
          >
            <Field
              label={t("name")}
              name="name"
              required
              defaultValue={data.user.name}
            />
            <Field
              label={t("email")}
              name="email"
              readOnly
              type="email"
              required
              defaultValue={data.user.email}
            />
            <ComboboxField
              label={t("timezone")}
              name="timezone"
              required
              defaultValue={data.user.timezone}
              options={["Asia/Colombo", "Asia/Singapore", "Europe/London", "America/New_York", "UTC"]}
            />
            {error && (
              <p
                role="alert"
                className="text-body text-error-600 dark:text-error-400"
              >
                {error}
              </p>
            )}
            <Button type="submit">{t("saveProfile")}</Button>
          </form>
        </ComponentCard>
        </section><section id="settings-preferences"><ComponentCard title={t("preferences")}>
          <SelectField
            label={t("theme")}
            value={themeMode}
            onChange={(event) => {
              const mode = event.target.value as User["theme"];
              setThemeMode(mode);
              save({ theme: mode });
            }}
          >
            {["light", "dark", "auto"].map((mode) => (
              <option key={mode} value={mode}>
                {t(mode)}
              </option>
            ))}
          </SelectField>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              save({
                weekStartDay: Number(fields.get("weekStart")) as 0 | 1,
                weeklyTargetMinutes: Math.round(
                  Number(fields.get("goal")) * 60,
                ),
              });
            }}
          >
            <SelectField
              label={t("weekStarts")}
              name="weekStart"
              defaultValue={data.user.weekStartDay}
            >
              <option value={1}>{t("monday")}</option>
              <option value={0}>{t("sunday")}</option>
            </SelectField>
            <Field
              label={t("weeklyGoalHours")}
              name="goal"
              type="number"
              min={0}
              max={168}
              step={0.5}
              defaultValue={data.user.weeklyTargetMinutes / 60}
            />
            <Button type="submit">{t("savePreferences")}</Button>
          </form>
        </ComponentCard>
        </section><section id="settings-notifications"><ComponentCard title={t("notifications")}>
          <label className="flex items-center gap-3 text-body">
            <Checkbox
              checked={data.user.reminders}
              onCheckedChange={(checked) => save({ reminders: checked === true })}
            />
            {t("inAppReminders")}
          </label>
          <p className="text-small text-muted dark:text-secondary">
            {t("remindersDescription")}
          </p>
        </ComponentCard>
        </section><section id="settings-dangerZone"><ComponentCard title={t("dangerZone")}>
          <p className="text-body text-muted dark:text-secondary">
            {t("exportHelp")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => { const link = document.createElement("a"); link.href = "/api/export"; link.download = "studyflow-data.json"; link.click(); }}
            >
              {t("exportData")}
            </Button>
            <Button variant="outline" onClick={deletion.openModal}>
              {t("deleteAccount")}
            </Button>
          </div>
        </ComponentCard>
        </section>
        {message && (
          <p
            role="status"
            className="text-body text-success-700 dark:text-success-300"
          >
            {message}
          </p>
        )}
      </div>
      </div>
      <ConfirmDialog
        background={false}
        isOpen={deletion.isOpen}
        onClose={deletion.closeModal}
        title={t("deleteAccount")}
        description={t("deleteAccountWarning")}
        onConfirm={async () => {
          try { const result = await deleteMyAccount(); if (!result.ok) { setError(t(result.error)); return false; } router.replace("/register"); }
          catch { setError(t("saveFailed")); return false; }
        }}
      />
    </>
  );
}
