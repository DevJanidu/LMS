import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { APP_NAME } from "@/lib/constants";
import { SITE_URL } from "@/lib/site";
import { getBillingProvider } from "@/lib/billing/provider";
import Hero from "@/components/marketing/Hero";
import ProductShowcase from "@/components/marketing/ProductShowcase";
import AvenShowcase from "@/components/marketing/AvenShowcase";
import HowItWorks from "@/components/marketing/HowItWorks";
import TrustSection from "@/components/marketing/TrustSection";
import Pricing from "@/components/marketing/Pricing";
import Faq from "@/components/marketing/Faq";
import FinalCta from "@/components/marketing/FinalCta";
import StructuredData from "@/components/marketing/StructuredData";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.meta");
  return (
    <>
      <StructuredData url={SITE_URL} description={t("description")} />
      <Hero />
      <ProductShowcase />
      <AvenShowcase />
      <HowItWorks />
      <TrustSection />
      <Pricing checkoutAvailable={getBillingProvider() !== null} />
      <Faq />
      <FinalCta />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing.meta" });
  return {
    metadataBase: new URL(SITE_URL),
    title: { absolute: t("title") },
    description: t("description"),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: APP_NAME,
      title: t("title"),
      description: t("description"),
      images: [{ url: "/images/logo/light-logo.png", width: 1536, height: 1024, alt: APP_NAME }],
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description") },
  };
}
