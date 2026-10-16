import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { getBillingOverview } from "@/lib/billing/entitlements";
import SidebarAccount, { type SidebarAccountProps } from "./SidebarAccount";

type Account = Omit<SidebarAccountProps, "planName" | "showUpgrade"> & { id: string };

/** The account card renders immediately; the plan badge streams in without delaying the shell. */
export default function SidebarAccountSlot({ id, ...account }: Account) {
  if (account.admin) return <SidebarAccount {...account} />;
  return (
    <Suspense fallback={<SidebarAccount {...account} />}>
      <WithPlan id={id} {...account} />
    </Suspense>
  );
}

async function WithPlan({ id, ...account }: Account) {
  const names = await getTranslations("marketing.pricing.plans");
  const plan = await getBillingOverview(id).then(overview => overview.plan).catch(() => null);
  return <SidebarAccount {...account} planName={plan ? names(`${plan}.name`) : undefined} showUpgrade={plan === "free"} />;
}
