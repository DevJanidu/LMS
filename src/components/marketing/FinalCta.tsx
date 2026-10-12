import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon } from "@/icons";

export default function FinalCta() {
  const t = useTranslations("marketing.finalCta");
  return (
    <section className="mk-section" aria-labelledby="mk-cta-title">
      <div className="mk-container">
        <div className="mk-cta">
          <h2 id="mk-cta-title" className="mk-title mx-auto max-w-2xl">{t("title")}</h2>
          <p className="mk-lead mx-auto mt-4 max-w-xl">{t("description")}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/register" className="mk-btn mk-btn-primary mk-btn-lg w-full sm:w-auto">{t("primary")}<ArrowRightIcon /></Link>
            <Link href="/pricing" className="mk-btn mk-btn-secondary mk-btn-lg w-full sm:w-auto">{t("secondary")}</Link>
          </div>
          <p className="mt-5 text-small mk-muted">{t("trust")}</p>
        </div>
      </div>
    </section>
  );
}
