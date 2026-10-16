"use client";
import { useTranslations } from "next-intl";

/** Loading placeholder sized like a typical panel, so content does not jump in. */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="sc-skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, index) => <span key={index} className="sf-set-skeleton" />)}
    </div>
  );
}

export function PanelError({ code, onRetry }: { code: string | null; onRetry: () => void }) {
  const t = useTranslations("circles");
  return (
    <div className="sc-error" role="alert">
      <p>{t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.serviceUnavailable")}</p>
      <button type="button" className="sf-set-button" data-variant="secondary" onClick={onRetry}>{t("retry")}</button>
    </div>
  );
}

/** Error code from a failed action, as user-facing copy. */
export function useErrorText() {
  const t = useTranslations("circles");
  return (code: unknown) => { const key = code instanceof Error ? code.message : String(code); return t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.serviceUnavailable"); };
}
