import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import SectionHeading from "./SectionHeading";

const QUESTIONS = ["free", "freeIncludes", "aven", "proVsPlus", "changePlan", "cancel", "mobile", "withoutAi", "data", "autoChange"] as const;

/** Native <details> accordion: keyboard accessible and works without JavaScript. */
export default function Faq() {
  const t = useTranslations("marketing.faq");
  return (
    <section id="faq" className="mk-section mk-band" aria-labelledby="mk-faq-title">
      <div className="mk-container grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-20">
        <div>
          <SectionHeading id="mk-faq-title" eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
          <p className="mk-copy mt-6">
            {t.rich("privacyLink", {
              privacy: (chunks) => <Link href="/privacy" className="font-medium text-brand-500 underline-offset-4 hover:underline dark:text-brand-300">{chunks}</Link>,
              terms: (chunks) => <Link href="/terms" className="font-medium text-brand-500 underline-offset-4 hover:underline dark:text-brand-300">{chunks}</Link>,
            })}
          </p>
        </div>
        <div className="mk-faq">
          {QUESTIONS.map((key) => (
            <details key={key} id={key === "cancel" ? "faq-cancel" : undefined}>
              <summary>
                {t(`items.${key}.question`)}
                <span className="mk-faq-icon" aria-hidden="true" />
              </summary>
              <div className="mk-copy">{t(`items.${key}.answer`)}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
