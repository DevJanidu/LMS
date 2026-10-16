"use client";
import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/icons";

interface Props {
  /** The three plan cards, rendered on the server. */
  children: ReactNode;
  comparison: ReactNode;
}

/**
 * Plan cards plus the "Compare all features" accordion. Opening it folds the
 * cards to a summary and gives the table the remaining height; only the table scrolls.
 */
export default function BillingPlans({ children, comparison }: Props) {
  const t = useTranslations("marketing.compare");
  const b = useTranslations("billing");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="bl-plans" data-compare={open ? "open" : "closed"}>
      <div className="bl-cards">{children}</div>
      <section className="bl-compare" aria-label={t("toggle")}>
        <button type="button" className="bl-compare-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>
          <span>{t("toggle")}</span>
          <span className="bl-compare-hint">{open ? b("compareHide") : b("compareHint")}</span>
          <ChevronDownIcon aria-hidden="true" />
        </button>
        <div id={panelId} className="bl-compare-panel" inert={!open}>
          <div className="bl-compare-scroll" role="region" tabIndex={open ? 0 : -1} aria-label={t("caption")}>{comparison}</div>
        </div>
      </section>
    </div>
  );
}
