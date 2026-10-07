"use client";
import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { authenticate } from "@/app/[locale]/auth-actions";
import { APP_NAME } from "@/lib/constants";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import Field from "@/components/studyflow/FormFields";
interface Props {
  token?: string;
  returnTo?: string;
  mode: "login" | "register" | "forgot-password" | "reset-password";
}
/** Account forms submit only to the authenticated server API. */
export default function AuthForm({ token, mode, returnTo }: Props) {
  const t = useTranslations("studyflow");
  const router = useRouter();
  const register = mode === "register";
  const reset = mode === "reset-password";
  const forgot = mode === "forgot-password";
  const [result, submit, pending] = useActionState(async (_previous: Awaited<ReturnType<typeof authenticate>> | undefined, fields: FormData) => {
    if (reset && fields.get("password") !== fields.get("confirmation")) return { ok: false as const, error: "passwordMismatch" };
    return authenticate({ mode, token, returnTo, email: reset ? undefined : String(fields.get("email")), name: register ? String(fields.get("name")) : undefined, password: forgot ? undefined : String(fields.get("password")), acceptedTerms: fields.get("terms") === "on", dateOfBirth: fields.get("dob") || undefined });
  }, undefined);
  const error = result && !result.ok ? t(result.error) : "";
  const message = result?.ok ? t("resetEmailSent") : "";
  useEffect(() => { if (mode === "login") router.prefetch("/dashboard"); }, [mode, router]);
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
        action={submit}
        aria-busy={pending}
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("loading") : t(
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
                className="text-brand-600 underline dark:text-brand-300"
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
            href="/login"
            className="block text-center text-sm text-brand-600 dark:text-brand-300"
          >
            {t("backLogin")}
          </Link>
        )}
      </form>

    </div>
  );
}
