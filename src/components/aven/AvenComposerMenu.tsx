"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
export interface MenuOption {
  key: string;
  label: string;
  detail: string;
  /** Short category chip: a mention type or "command". */
  badge: string;
}
interface Props {
  id: string;
  label: string;
  options: MenuOption[];
  activeIndex: number;
  loading: boolean;
  error: boolean;
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
}
export const optionId = (menu: string, index: number) => `${menu}-option-${index}`;
/** Suggestion list for the composer; focus stays in the textarea (aria-activedescendant). */
export default function AvenComposerMenu({
  id,
  label,
  options,
  activeIndex,
  loading,
  error,
  onSelect,
  onHover,
}: Props) {
  const t = useTranslations("aven.composerMenu"),
    list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current
      ?.querySelector(`#${CSS.escape(optionId(id, activeIndex))}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, id]);
  return (
    <div className="aven-composer-menu">
      <ul ref={list} id={id} role="listbox" aria-label={label}>
        {options.map((option, index) => (
          <li
            key={option.key}
            id={optionId(id, index)}
            role="option"
            aria-selected={index === activeIndex}
            className="aven-composer-option"
            // Keep focus in the textarea; selection happens on click (mouse and touch).
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(index)}
          >
            <span className="aven-composer-option-badge">{option.badge}</span>
            <span className="aven-composer-option-text">
              <span className="aven-composer-option-label">{option.label}</span>
              {option.detail && (
                <span className="aven-composer-option-detail">{option.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {(loading || error || !options.length) && (
        <p className="aven-composer-menu-status" role="status">
          {loading ? t("searching") : error ? t("error") : t("empty")}
        </p>
      )}
    </div>
  );
}
