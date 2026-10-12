"use client";
import { runServerAction } from "@/lib/client/server-actions";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { authenticate } from "@/app/[locale]/auth-actions";
import { APP_NAME } from "@/lib/constants";
import BrandLogo from "@/components/studyflow/BrandLogo";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import { DatePickerField } from "@/components/form/DatePickerField";
import { Checkbox } from "@/components/ui/Checkbox";
import AuthInput from "./AuthInput";
import { parseAuthInput, validResetToken, type AuthResult, type AuthField } from "@/lib/auth/input";
interface Props {
  token?: string;
  returnTo?: string;
  mode: "login" | "register" | "forgot-password" | "reset-password";
  resetLinkError?: "invalid" | "unavailable";
  passwordResetComplete?: boolean;
}
/** Account forms submit only to the authenticated server API. */
export default function AuthForm({ token, mode, returnTo, resetLinkError, passwordResetComplete }: Props) {
  const t = useTranslations("studyflow");
  const format = useFormatter();
  const router = useRouter();
  const register = mode === "register";
  const reset = mode === "reset-password";
  const forgot = mode === "forgot-password";
  const form = useRef<HTMLFormElement>(null);
  const [details, setDetails] = useState({ name: "", email: "", password: "", confirmation: "", dob: "", terms: false });
  const unusableLink = reset && (resetLinkError || !validResetToken(token));
  const [result, submit, pending] = useActionState(async (_previous: AuthResult | undefined, fields: FormData): Promise<AuthResult> => {
    const input = { mode, token, returnTo, email: reset ? undefined : String(fields.get("email") ?? ""), name: register ? String(fields.get("name") ?? "") : undefined, password: forgot ? undefined : String(fields.get("password") ?? ""), acceptedTerms: fields.get("terms") === "on", dateOfBirth: fields.get("dob") || undefined };
    const validation = parseAuthInput(input);
    if (!validation.success) return validation.result;
    if (reset && fields.get("password") !== fields.get("confirmation")) return { ok: false, error: "passwordMismatch", field: "confirmation" };
    try { return await runServerAction(() => authenticate(validation.data)); }
    catch (error) {
      // Next.js uses a redirect signal to navigate after successful actions.
      if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT;")) throw error;
      return { ok: false, error: "authenticationUnavailable" };
    }
  }, undefined);
  const failure = result && !result.ok ? result : undefined;
  const failureText = failure?.error === "passwordResetWeeklyLimit"
    ? t("passwordResetWeeklyLimit", { date: failure.retryAt ? format.dateTime(new Date(failure.retryAt), { dateStyle: "medium", timeZone: "UTC" }) : t("nextWeek") })
    : failure ? t(failure.error) : "";
  const error = failureText || (unusableLink ? t(resetLinkError === "unavailable" ? "authenticationUnavailable" : "invalidResetLink") : "");
  const fieldError = (field: AuthField) => failure?.field === field ? t(failure.error) : undefined;
  const message = result?.ok && forgot ? t("resetEmailSentTo", { email: result.email ?? "" }) : passwordResetComplete ? t("passwordResetComplete") : "";
  const invalidLink = unusableLink || failure?.error === "invalidResetLink";
  useEffect(() => {
    if (failure?.field) {
      const selector = failure.field === "terms" ? '[role="checkbox"]' : `[name="${failure.field}"]`;
      form.current?.querySelector<HTMLElement>(selector)?.focus();
    }
  }, [failure]);
  useEffect(() => { if (mode === "login") router.prefetch("/dashboard"); }, [mode, router]);
  const title = register
    ? "createAccount"
    : reset
      ? "resetPassword"
      : forgot
        ? "forgotPassword"
        : "welcomeBack";
  return (
    <div className="sf-auth-form mx-auto w-full max-w-md" data-auth-mode={mode}>
      {(mode === "login" || register) && <BrandLogo className="sf-auth-logo" />}
      <PageHeader title={t(title)} description={t(forgot ? "forgotPasswordDescription" : reset ? "resetPasswordDescription" : "authDescription")} />
      <form
        ref={form}
        noValidate
        className="space-y-5"
        action={submit}
        aria-busy={pending}
      >
        {!(reset && invalidLink) && <div className="sf-auth-fields">
          {register && (
            <AuthInput label={t("name")} name="name" value={details.name} onChange={event => setDetails(current => ({ ...current, name: event.target.value }))} error={fieldError("name")} required maxLength={150} autoComplete="name" />
          )}
          {!reset && (
            <AuthInput
              label={t("email")}
              type="email"
              name="email"
              value={details.email}
              onChange={event => setDetails(current => ({ ...current, email: event.target.value }))}
              error={fieldError("email")}
              required
              autoComplete="email"
            />
          )}
          {!forgot && (
            <AuthInput
              label={t("password")}
              type="password"
              name="password"
              value={details.password}
              onChange={event => setDetails(current => ({ ...current, password: event.target.value }))}
              error={fieldError("password")}
              required
              minLength={mode === "login" ? undefined : 8}
              maxLength={128}
              autoComplete={
                register || reset ? "new-password" : "current-password"
              }
            />
          )}
          {reset && (
            <AuthInput
              label={t("confirmPassword")}
              type="password"
              name="confirmation"
              value={details.confirmation}
              onChange={event => setDetails(current => ({ ...current, confirmation: event.target.value }))}
              error={fieldError("confirmation")}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
            />
          )}
          {register && (
            <DatePickerField label={t("dobOptional")} name="dob" value={details.dob} onChange={event => setDetails(current => ({ ...current, dob: event.target.value }))} compact max={new Date().toISOString().slice(0, 10)} />
          )}
        </div>}
        {register && (
          <>
            <label className="flex items-start gap-3 text-body">
              <Checkbox name="terms" checked={details.terms} onCheckedChange={checked => setDetails(current => ({ ...current, terms: checked === true }))} required className="mt-1" />
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
            <p className="text-small text-muted dark:text-secondary">
              {t("adminDisclosure")}
            </p>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="text-body text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className="text-body text-success-700 dark:text-success-300"
          >
            {message}
          </p>
        )}
        {!(reset && invalidLink) && <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("loading") : t(
            register
              ? "signUp"
              : reset
                ? "resetPassword"
                : forgot
                  ? "sendResetLink"
                  : "signIn",
          )}
        </Button>}
        {reset && invalidLink && <Link href="/forgot-password" className="block text-center text-body text-brand-600 dark:text-brand-300">{t("requestNewResetLink")}</Link>}
        {!forgot && !reset && (
          <>
            <Button variant="outline" className="w-full" disabled>
              {t("googleComingSoon")}
            </Button>
            <p className="text-center text-body text-muted dark:text-secondary">
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
            className="block text-center text-body text-brand-600 dark:text-brand-300"
          >
            {t("forgotPassword")}
          </Link>
        )}
        {(forgot || reset) && (
          <Link
            href="/login"
            className="block text-center text-body text-brand-600 dark:text-brand-300"
          >
            {t("backLogin")}
          </Link>
        )}
      </form>

    </div>
  );
}
