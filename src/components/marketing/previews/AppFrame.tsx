import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import BrandLogo from "@/components/studyflow/BrandLogo";
import { learnerNavigation } from "@/components/navigation/navigation";
import { PlayIcon, SearchIcon } from "@/icons";

interface Props {
  /** Navigation href shown as active, e.g. "/dashboard". */
  active: string;
  label: string;
  children: ReactNode;
}

/**
 * Static rendering of the Acadence workspace shell, built from the same
 * navigation config and labels as the real sidebar.
 */
export default function AppFrame({ active, label, children }: Props) {
  const t = useTranslations("studyflow");
  const m = useTranslations("marketing.preview");
  return (
    <figure className="mk-frame" aria-label={label}>
      <div className="mk-app" aria-hidden="true" inert>
        <aside className="mk-app-side">
          <BrandLogo />
          <span className="mk-app-cta">
            <PlayIcon />
            {t("startStudying")}
          </span>
          {learnerNavigation.map(({ key, labelKey = key, href, icon: Icon }) => (
            <span key={href} className="mk-app-nav" data-active={href === active}>
              <Icon />
              {t(labelKey)}
            </span>
          ))}
        </aside>
        <div className="mk-app-main">
          <div className="mk-app-top">
            <span className="mk-app-search">
              <SearchIcon />
              {m("search")}
            </span>
            <span className="mk-app-avatar">{m("avatar")}</span>
          </div>
          <div className="mk-app-body">{children}</div>
        </div>
      </div>
    </figure>
  );
}
