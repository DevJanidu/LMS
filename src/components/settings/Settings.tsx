"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useModal } from "@/hooks/useModal";
import { getResources, getSessions, getSubjects, getTopics } from "@/lib/mock";
import { updateWorkspace, useWorkspace } from "@/lib/mock/store";
import type { User, Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Field, { SelectField } from "@/components/studyflow/FormFields";
interface Props {
  initial: Workspace;
}
/** Profile, study preferences and simulated account controls. */
export default function Settings({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const router = useRouter();
  const { themeMode, setThemeMode } = useTheme();
  const deletion = useModal();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const save = (patch: Partial<User>) => {
    updateWorkspace(initial, (state) => ({
      ...state,
      user: { ...state.user, ...patch, updatedAt: new Date().toISOString() },
      users: state.users.map((user) =>
        user.id === state.user.id ? { ...user, ...patch } : user,
      ),
    }));
    setMessage(t("settingsSaved"));
  };
  return (
    <>
      <PageHeader
        title={t("settings")}
        description={t("settingsDescription")}
      />
      <div className="max-w-3xl space-y-6">
        <ComponentCard title={t("profile")}>
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
              type="email"
              required
              defaultValue={data.user.email}
            />
            <Field
              label={t("timezone")}
              name="timezone"
              required
              defaultValue={data.user.timezone}
              list="timezones"
            />
            <datalist id="timezones">
              {[
                "Asia/Colombo",
                "Asia/Singapore",
                "Europe/London",
                "America/New_York",
                "UTC",
              ].map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            {error && (
              <p
                role="alert"
                className="text-sm text-error-600 dark:text-error-400"
              >
                {error}
              </p>
            )}
            <Button type="submit">{t("saveProfile")}</Button>
          </form>
        </ComponentCard>
        <ComponentCard title={t("preferences")}>
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
        <ComponentCard title={t("notifications")}>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={data.user.reminders}
              onChange={(event) => save({ reminders: event.target.checked })}
            />
            {t("inAppReminders")}
          </label>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">
            {t("remindersDescription")}
          </p>
        </ComponentCard>
        <ComponentCard title={t("dangerZone")}>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("exportHelp")}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                const exported = {
                  user: data.user,
                  subjects: getSubjects(data),
                  topics: getTopics(data),
                  resources: getResources(data),
                  sessions: getSessions(data),
                  schedule: data.blocks.filter(
                    (block) => block.userId === data.user.id,
                  ),
                };
                const blob = new Blob([JSON.stringify(exported, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = "studyflow-data.json";
                anchor.click();
                URL.revokeObjectURL(url);
              }}
            >
              {t("exportData")}
            </Button>
            <Button variant="outline" onClick={deletion.openModal}>
              {t("deleteAccount")}
            </Button>
          </div>
        </ComponentCard>
        {message && (
          <p
            role="status"
            className="text-sm text-success-700 dark:text-success-300"
          >
            {message}
          </p>
        )}
      </div>
      <ConfirmDialog
        isOpen={deletion.isOpen}
        onClose={deletion.closeModal}
        title={t("deleteAccount")}
        description={t("deleteAccountWarning")}
        onConfirm={() => {
          updateWorkspace(initial, (state) => {
            const ids = new Set(
              getSubjects(state).map((subject) => subject.id),
            );
            return {
              ...state,
              user: {
                ...state.user,
                name: t("newLearner"),
                email: "",
                learningContext: undefined,
                longestStreak: 0,
              },
              users: state.users.filter((user) => user.id !== state.user.id),
              subjects: state.subjects.filter(
                (subject) => !ids.has(subject.id),
              ),
              topics: state.topics.filter((topic) => !ids.has(topic.subjectId)),
              sessions: state.sessions.filter(
                (session) => session.userId !== state.user.id,
              ),
              resources: state.resources.filter(
                (resource) => resource.userId !== state.user.id,
              ),
              blocks: state.blocks.filter(
                (block) => block.userId !== state.user.id,
              ),
              notifications: state.notifications.filter(
                (notification) => notification.userId !== state.user.id,
              ),
              timer: null,
            };
          });
          router.push("/register");
        }}
      />
    </>
  );
}
