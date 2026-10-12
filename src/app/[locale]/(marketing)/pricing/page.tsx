import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { APP_NAME } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { getBillingProvider } from "@/lib/billing/provider";
import Pricing from "@/components/marketing/Pricing";
import Faq from "@/components/marketing/Faq";
import FinalCta from "@/components/marketing/FinalCta";
import StructuredData from "@/components/marketing/StructuredData";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.pricingMeta");
  return (
    <>
      <StructuredData url={`${SITE_URL}/pricing`} description={t("description")} />
      <h1 className="sr-only">{t("title")}</h1>
      <Pricing checkoutAvailable={getBillingProvider() !== null} />
      <Faq />
      <FinalCta />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.pricingMeta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/pricing" },
    openGraph: { type: "website", url: "/pricing", siteName: APP_NAME, title: `${t("title")} | ${APP_NAME}`, description: t("description") },
  };
}
