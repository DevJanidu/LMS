"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { updateWorkspace, useWorkspace } from "@/lib/mock/store";
import { getSubjects } from "@/lib/mock";
import type { Workspace } from "@/types";
import { APP_NAME } from "@/lib/constants";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import Field from "@/components/studyflow/FormFields";
interface Props {
  initial: Workspace;
  mode: "login" | "register" | "forgot-password" | "reset-password";
}
/** UI-only account flow; passwords are never persisted or sent. */
export default function AuthForm({ initial, mode }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const register = mode === "register";
  const reset = mode === "reset-password";
  const forgot = mode === "forgot-password";
  const title = register
    ? "createAccount"
    : reset
      ? "resetPassword"
      : forgot
        ? "forgotPassword"
        : "welcomeBack";
  return (
    <div className="sf-auth-form mx-auto w-full max-w-md">
      <PageHeader title={t(title)} description={t("authDescription")} />
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          if (reset && fields.get("password") !== fields.get("confirmation")) {
            setError(t("passwordMismatch"));
            return;
          }
          if (register) {
            const name = String(fields.get("name")).trim();
            if (!name) {
              setError(t("nameRequired"));
              return;
            }
            updateWorkspace(initial, (state) => {
              const subjectIds = new Set(
                getSubjects(state).map((subject) => subject.id),
              );
              const user = {
                ...state.user,
                name,
                email: String(fields.get("email")),
                longestStreak: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              return {
                ...state,
                user,
                users: [
                  ...state.users.filter((item) => item.id !== user.id),
                  user,
                ],
                subjects: state.subjects.filter(
                  (subject) => !subjectIds.has(subject.id),
                ),
                topics: state.topics.filter(
                  (topic) => !subjectIds.has(topic.subjectId),
                ),
                resources: state.resources.filter(
                  (resource) => resource.userId !== user.id,
                ),
                sessions: state.sessions.filter(
                  (session) => session.userId !== user.id,
                ),
                blocks: state.blocks.filter(
                  (block) => block.userId !== user.id,
                ),
                notifications: state.notifications.filter(
                  (item) => item.userId !== user.id,
                ),
                timer: null,
              };
            });
            router.push("/onboarding");
          } else if (forgot || reset) {
            setError("");
            setMessage(t(forgot ? "resetEmailMock" : "passwordResetMock"));
          } else if (data.user.status === "inactive")
            setError(t("accountInactive"));
          else router.push("/dashboard");
        }}
      >
        {register && (
          <Field label={t("name")} name="name" required autoComplete="name" />
        )}
        {!reset && (
          <Field
            label={t("email")}
            type="email"
            name="email"
            required
            autoComplete="email"
          />
        )}
        {!forgot && (
          <Field
            label={t("password")}
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete={
              register || reset ? "new-password" : "current-password"
            }
          />
        )}{" "}
        {reset && (
          <Field
            label={t("confirmPassword")}
            type="password"
            name="confirmation"
            required
            minLength={8}
            autoComplete="new-password"
          />
        )}
        {register && (
          <>
            <Field label={t("dobOptional")} name="dob" type="date" />
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="terms" required className="mt-1" />
              <span>
                {t("acceptTerms")}{" "}
                <Link
                  href="/terms"
                  className="text-brand-600 underline dark:text-brand-300"
                >
                  {t("terms")}
                </Link>{" "}
                {t("and")}{" "}
                <Link
                  href="/privacy"
                  className="text-brand-600 underline dark:text-brand-300"
                >
                  {t("privacy")}
                </Link>
              </span>
            </label>
            <p className="text-theme-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {t("adminDisclosure")}
            </p>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="text-sm text-success-700 dark:text-success-300"
          >
            {message}
          </p>
        )}
        <Button type="submit" className="w-full">
          {t(
            register
              ? "signUp"
              : reset
                ? "resetPassword"
                : forgot
                  ? "sendResetLink"
                  : "signIn",
          )}
        </Button>
        {!forgot && !reset && (
          <>
            <Button variant="outline" className="w-full" disabled>
              {t("googleComingSoon")}
            </Button>
            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
              {t(register ? "alreadyAccount" : "needAccount", {
                appName: APP_NAME,
              })}{" "}
              <Link
                href={register ? "/login" : "/register"}
                className="text-brand-600 dark:text-brand-300"
              >
                {t(register ? "signIn" : "signUp")}
              </Link>
            </p>
          </>
        )}
        {mode === "login" && (
          <Link
            href="/forgot-password"
            className="block text-center text-sm text-brand-600 dark:text-brand-300"
          >
            {t("forgotPassword")}
          </Link>
        )}
        {(forgot || reset) && (
          <Link
            href={forgot ? "/reset-password" : "/login"}
            className="block text-center text-sm text-brand-600 dark:text-brand-300"
          >
            {t(forgot ? "previewReset" : "backLogin")}
          </Link>
        )}
      </form>
      <p className="mt-7 text-center text-theme-xs text-gray-400 dark:text-gray-500">
        {t("authMockNotice")}
      </p>
    </div>
  );
}
