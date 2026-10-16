"use client";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "@/icons";
import type { ComposerIcon as IconName } from "@/lib/aven/composer-registry";
import ComposerIcon from "./ComposerIcon";
export interface MenuRow {
  key: string;
  icon: IconName | "user";
  label: string;
  description: string;
  /** Chip for result type ("Subject", "Goal"…); omitted for commands. */
  badge?: string;
  disabled?: boolean;
  submenu?: boolean;
}
interface Props {
  id: string;
  label: string;
  /** listbox: focus stays in the textarea (combobox); menu: focus moves into the list. */
  role: "listbox" | "menu";
  rows: MenuRow[];
  activeIndex: number;
  side: "top" | "bottom";
  maxHeight: number;
  status?: string;
  /** Shown above a nested list, with a back control. */
  parent?: { label: string; onBack: () => void };
  onSelect: (index: number) => void;
  onHover: (index: number) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
}
export const rowId = (menu: string, index: number) => `${menu}-row-${index}`;
/**
 * The floating menu shared by "/", "@" and "+": compact rows with icon, label and muted
 * description, disabled rows that explain why, and an optional nested level.
 */
export default function ComposerMenu({
  id,
  label,
  role,
  rows,
  activeIndex,
  side,
  maxHeight,
  status,
  parent,
  onSelect,
  onHover,
  onKeyDown,
}: Props) {
  const t = useTranslations("aven.composerItems"),
    list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const row = list.current?.querySelector<HTMLElement>(`#${CSS.escape(rowId(id, activeIndex))}`);
    row?.scrollIntoView({ block: "nearest" });
    if (role === "menu") row?.focus({ preventScroll: true });
  }, [activeIndex, id, role]);
  const item = role === "menu" ? "menuitem" : "option";
  return (
    <div className="aven-menu" data-side={side} data-nested={parent ? "" : undefined} style={{ maxHeight }}>
      {parent && (
        <button
          type="button"
          className="aven-menu-back"
          onMouseDown={(event) => event.preventDefault()}
          onClick={parent.onBack}
        >
          <ChevronLeftIcon aria-hidden="true" className="aven-menu-icon" />
          <span>{parent.label}</span>
          <span className="sr-only">{t("back")}</span>
        </button>
      )}
      <ul ref={list} id={id} role={role} aria-label={label} onKeyDown={onKeyDown}>
        {rows.map((row, index) => (
          <li
            key={row.key}
            id={rowId(id, index)}
            role={item}
            tabIndex={role === "menu" ? (index === activeIndex ? 0 : -1) : undefined}
            aria-selected={role === "listbox" ? index === activeIndex : undefined}
            aria-disabled={row.disabled || undefined}
            aria-haspopup={row.submenu ? "true" : undefined}
            data-active={index === activeIndex || undefined}
            className="aven-menu-row"
            // Pointer selection never takes focus from the composer.
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => index !== activeIndex && onHover(index)}
            onClick={() => !row.disabled && onSelect(index)}
          >
            <ComposerIcon name={row.icon} />
            <span className="aven-menu-text">
              <span className="aven-menu-label">{row.label}</span>
              {row.description && <span className="aven-menu-description">{row.description}</span>}
            </span>
            {row.badge && <span className="aven-menu-badge">{row.badge}</span>}
            {row.disabled && <span className="aven-menu-badge">{t("unavailable")}</span>}
            {row.submenu && (
              <ChevronRightIcon aria-hidden="true" className="aven-menu-icon aven-menu-chevron" />
            )}
          </li>
        ))}
      </ul>
      {status && (
        <p className="aven-menu-status" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
