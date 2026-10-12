import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import BrandLogo from "@/components/studyflow/BrandLogo";
import { APP_NAME } from "@/lib/constants";

interface Column {
  key: string;
  links: { key: string; href: string }[];
}

/** Public contact address; the Contact link is shown only once it is configured. */
const contactEmail = process.env.CONTACT_EMAIL?.trim();

export default function MarketingFooter() {
  const t = useTranslations("marketing.footer");
  const columns: Column[] = [
    { key: "product", links: [{ key: "features", href: "/#features" }, { key: "aven", href: "/#aven" }, { key: "pricing", href: "/pricing" }] },
    { key: "company", links: [{ key: "howItWorks", href: "/#how-it-works" }, { key: "faq", href: "/#faq" }, ...(contactEmail ? [{ key: "contact", href: `mailto:${contactEmail}` }] : [])] },
    { key: "legal", links: [{ key: "privacy", href: "/privacy" }, { key: "terms", href: "/terms" }, { key: "cancellation", href: "/pricing#faq-cancel" }] },
    { key: "account", links: [{ key: "login", href: "/login" }, { key: "signup", href: "/register" }] },
  ];
  return (
    <footer className="mk-footer">
      <div className="mk-container grid gap-12 py-16 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,3fr)]">
        <div className="max-w-xs">
          <Link href="/" className="mk-logo" aria-label={t("home")}><BrandLogo /></Link>
          <p className="mk-copy mt-4">{t("tagline")}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {columns.map((column) => (
            <div key={column.key}>
              <h2>{t(`columns.${column.key}`)}</h2>
              <ul className="mt-4 grid gap-3">
                {column.links.map((link) => (
                  <li key={link.key}>
                    {link.href.startsWith("mailto:") ? <a href={link.href}>{t(`links.${link.key}`)}</a> : <Link href={link.href}>{t(`links.${link.key}`)}</Link>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mk-container flex flex-col gap-2 border-t mk-hairline py-6 text-small mk-muted sm:flex-row sm:items-center sm:justify-between">
        <p>{t("copyright", { year: new Date().getFullYear(), appName: APP_NAME })}</p>
        <p>{t("brandLine")}</p>
      </div>
    </footer>
  );
}
