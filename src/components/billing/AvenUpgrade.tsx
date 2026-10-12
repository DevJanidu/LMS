import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, CheckIcon, SparklesIcon } from "@/icons";

/** Shown instead of the chat when the learner's plan has no Aven access. */
export default function AvenUpgrade() {
  const t = useTranslations("billing.avenUpgrade");
  const benefits = t.raw("benefits") as string[];
  return (
    <section className="mx-auto grid max-w-2xl gap-6 py-10 text-center" aria-labelledby="aven-upgrade-title">
      <span className="mk-aven-mark mx-auto"><SparklesIcon /></span>
      <div>
        <h1 id="aven-upgrade-title" className="text-display">{t("title")}</h1>
        <p className="mt-3 text-body mk-secondary">{t("description")}</p>
      </div>
      <ul className="mk-card mx-auto grid w-full max-w-md gap-3 p-5 text-start">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-3 text-body">
            <CheckIcon className="mt-0.5 size-4 text-brand-500 dark:text-brand-300" aria-hidden="true" />
            {benefit}
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/billing?plan=pro" className="mk-btn mk-btn-primary">{t("cta")}<ArrowRightIcon /></Link>
        <Link href="/goals" className="mk-btn mk-btn-ghost">{t("secondary")}</Link>
      </div>
      <p className="text-small mk-muted">{t("note")}</p>
    </section>
  );
}
