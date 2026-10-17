"use client";
import { useTranslations } from "next-intl";
/** The category mapping lives with the server, which sends only categories, never tool names. */
export { activityCategory } from "@/lib/aven/activity";
/**
 * The current real backend step (from tool-start / reasoning-status events). The label is
 * keyed so a new step cross-fades in once; screen readers get it from the companion's
 * polite live region instead, so it is hidden here.
 */
export default function AvenActivity({ name }: { name: string }) {
  const t = useTranslations("aven.activity");
  return (
    <div className="aven-activity" aria-hidden="true">
      <span className="aven-activity-dots">
        <span />
        <span />
        <span />
      </span>
      <span key={name} className="aven-activity-label">
        {t.has(name) ? t(name) : t("working")}
      </span>
    </div>
  );
}
