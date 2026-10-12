import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import MarketingFooter from "@/components/marketing/MarketingFooter";

/** Public marketing shell: no application sidebar, shared design tokens. */
export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.nav");
  return (
    <div className="mk-root flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-999 focus:rounded-lg focus:bg-white dark:focus:bg-gray-900 focus:px-4 focus:py-2 focus:shadow-theme-lg">
        {t("skip")}
      </a>
      <MarketingHeader />
      <main id="main" className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
