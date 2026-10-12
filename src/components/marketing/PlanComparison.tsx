import { useTranslations } from "next-intl";
import { CheckIcon, ChevronDownIcon } from "@/icons";
import { PLAN_IDS } from "@/lib/billing/plans";
import { COMPARISON } from "./comparison";

/** Expandable, horizontally scrollable feature comparison (native <details>, no JS). */
export default function PlanComparison() {
  const t = useTranslations("marketing.compare");
  const p = useTranslations("marketing.pricing.plans");
  return (
    <details className="mk-compare">
      <summary>
        {t("toggle")}
        <ChevronDownIcon aria-hidden="true" />
      </summary>
      <div className="mk-compare-scroll">
        <table>
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{t("feature")}</span></th>
              {PLAN_IDS.map((plan) => <th key={plan} scope="col">{p(`${plan}.name`)}</th>)}
            </tr>
          </thead>
          {COMPARISON.map((group) => (
            <tbody key={group.key}>
              <tr className="mk-compare-group">
                <th scope="colgroup" colSpan={4}>{t(`groups.${group.key}`)}</th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{t(`rows.${row.key}`)}</th>
                  {PLAN_IDS.map((plan) => {
                    const value = row.values[plan];
                    return (
                      <td key={plan}>
                        {value === true ? (
                          <><CheckIcon aria-hidden="true" /><span className="sr-only">{t("included")}</span></>
                        ) : value === false ? (
                          <><span className="mk-dash" aria-hidden="true">—</span><span className="sr-only">{t("notIncluded")}</span></>
                        ) : (
                          <span className="text-small">{t(`values.${value}`)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </details>
  );
}
