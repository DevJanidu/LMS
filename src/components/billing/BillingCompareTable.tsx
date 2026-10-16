import { useTranslations } from "next-intl";
import { CheckIcon } from "@/icons";
import { PLAN_IDS, type PlanId } from "@/lib/billing/plans";
import { COMPARISON } from "@/components/marketing/comparison";

/** Feature table with a sticky header row and grouped sections; the current plan's column is tinted. */
export default function BillingCompareTable({ current }: { current: PlanId }) {
  const t = useTranslations("marketing.compare");
  const p = useTranslations("marketing.pricing.plans");
  return (
    <table className="bl-table">
      <caption className="sr-only">{t("caption")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("feature")}</th>
          {PLAN_IDS.map(plan => <th key={plan} scope="col" data-current={plan === current || undefined}>{p(`${plan}.name`)}</th>)}
        </tr>
      </thead>
      {COMPARISON.map(group => (
        <tbody key={group.key}>
          <tr className="bl-table-group"><th scope="colgroup" colSpan={4}>{t(`groups.${group.key}`)}</th></tr>
          {group.rows.map(row => (
            <tr key={row.key}>
              <th scope="row">{t(`rows.${row.key}`)}</th>
              {PLAN_IDS.map(plan => {
                const value = row.values[plan];
                return (
                  <td key={plan} data-current={plan === current || undefined}>
                    {value === true ? <><CheckIcon aria-hidden="true" /><span className="sr-only">{t("included")}</span></>
                      : value === false ? <><span className="bl-dash" aria-hidden="true">—</span><span className="sr-only">{t("notIncluded")}</span></>
                      : <span>{t(`values.${value}`)}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
