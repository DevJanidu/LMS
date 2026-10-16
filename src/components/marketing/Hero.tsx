import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ArrowRightIcon, SparklesIcon } from "@/icons";
import AppFrame from "./previews/AppFrame";
import DashboardPreview from "./previews/DashboardPreview";

export default function Hero() {
  const t = useTranslations("marketing.hero");
  return (
    <section className="mk-hero" aria-labelledby="mk-hero-title">
      <div className="mk-hero-grid" aria-hidden="true" />
      <div className="mk-container relative text-center">
        <Link href="/#aven" className="mk-pill">
          <span className="mk-pill-tag"><SparklesIcon />{t("pillTag")}</span>
          {t("pill")}
          <ArrowRightIcon />
        </Link>
        <h1 id="mk-hero-title" className="mk-display mk-gradient-ink mx-auto mt-8 max-w-4xl">{t("title")}</h1>
        <p className="mk-lead mx-auto mt-6 max-w-2xl">{t("description")}</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login" className="mk-btn mk-btn-primary mk-btn-lg w-full sm:w-auto">
            {t("primaryCta")}
            <ArrowRightIcon />
          </Link>
          <Link href="/#aven" className="mk-btn mk-btn-secondary mk-btn-lg w-full sm:w-auto">
            <SparklesIcon className="text-brand-500 dark:text-brand-300" />
            {t("secondaryCta")}
          </Link>
        </div>
        <p className="mt-5 text-small mk-muted">{t("trust")}</p>
        <div className="mk-hero-stage mx-auto max-w-6xl text-start">
          <AppFrame active="/dashboard" label={t("previewLabel")}>
            <DashboardPreview />
          </AppFrame>
        </div>
      </div>
    </section>
  );
}
