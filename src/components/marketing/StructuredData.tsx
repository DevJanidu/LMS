import { APP_NAME } from "@/lib/constants";
import { formatPrice, PLAN_IDS, planPrice } from "@/lib/billing/plans";

/** schema.org SoftwareApplication with the configured plan prices only. */
export default function StructuredData({ url, description }: { url: string; description: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    url,
    description,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    offers: PLAN_IDS.flatMap((plan) => {
      const price = planPrice(plan);
      return price
        ? [{ "@type": "Offer", name: plan, price: (price.amountMinor / 100).toFixed(2), priceCurrency: price.currency, description: formatPrice(price) }]
        : [];
    }),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
