"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/client";
import { APP_NAME } from "@/lib/constants";
import { GoogleIcon } from "@/icons";
import BrandLogo from "@/components/studyflow/BrandLogo";

interface Props {
  /** Already validated by `safeReturnPath` on the server. */
  returnTo?: string;
  /** Translation key for an error returned by the OAuth redirect. */
  error?: string;
}

/**
 * Google is the only sign-in method. After the OAuth callback the browser
 * returns to `/login`, where the server picks the role and onboarding destination.
 */
export default function GoogleSignInCard({ returnTo, error: initialError }: Props) {
  const t = useTranslations("studyflow");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initialError);

  const signIn = async () => {
    if (pending) return;
    setPending(true);
    setError(undefined);
    const callbackURL = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: "/login" });
      if (result.error) throw result.error;
      // The client follows the provider redirect; keep the button busy until then.
    } catch (cause) {
      const status = (cause as { status?: number })?.status;
      // 503 means our auth service or its configuration is unavailable, not a Google failure.
      setError(status === 429 ? "tooManyRequests" : status === 503 ? "authenticationUnavailable" : "googleSignInFailed");
      setPending(false);
    }
  };

  return (
    <div className="sf-auth-form mx-auto w-full max-w-md" data-auth-mode="login">
      {/* The public layout's `.sf-public-form` supplies the bordered card surface. */}
      <section>
        <BrandLogo className="sf-auth-logo" />
        <div className="text-center">
          <h1 className="text-h1 text-primary dark:text-primary">{t("welcomeBack")}</h1>
          <p className="mt-2 text-body text-muted dark:text-secondary">{t("googleSignInDescription", { appName: APP_NAME })}</p>
        </div>
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={pending}
          aria-busy={pending}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-body-strong text-gray-800 shadow-theme-xs transition hover:bg-gray-50 focus-visible:shadow-focus-ring focus-visible:outline-none disabled:cursor-wait disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          <GoogleIcon aria-hidden="true" className="size-5 shrink-0" />
          {pending ? t("googleRedirecting") : t("continueWithGoogle")}
        </button>
        {error && <p role="alert" className="mt-4 text-center text-body text-error-600 dark:text-error-400">{t(error)}</p>}
        <p className="mt-8 border-t border-gray-200 pt-6 text-center text-small text-muted dark:border-gray-800 dark:text-secondary">
          {t("googleTermsNotice")}{" "}
          <Link href="/terms" className="text-brand-600 underline dark:text-brand-300">{t("terms")}</Link>{" "}
          {t("and")}{" "}
          <Link href="/privacy" className="text-brand-600 underline dark:text-brand-300">{t("privacy")}</Link>.
        </p>
      </section>
    </div>
  );
}
