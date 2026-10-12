"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ChevronDownIcon, SparklesIcon } from "@/icons";
/** Aven prompts that keep the goal and task context (see `aven.prompts`). */
const intents = ["startTask", "whyNext", "rescheduleTask", "catchUp"] as const;
interface Props {
  goalId: string;
  task: string;
}
/** Menu button following the WAI-ARIA menu pattern: arrows move, Escape closes. */
export default function AskAvenMenu({ goalId, task }: Props) {
  const t = useTranslations("goals.nextBestAction"),
    id = useId(),
    [open, setOpen] = useState(false),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const items = () =>
    Array.from(
      root.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ??
        [],
    );
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    const list = items(),
      index = list.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      list[(index + step + list.length) % list.length]?.focus();
    } else if (event.key === "Tab") setOpen(false);
  };
  return (
    <div ref={root} className="sf-menu" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className="sf-action-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <SparklesIcon className="size-4" aria-hidden="true" />
        {t("askAven")}
        <ChevronDownIcon
          className="sf-menu-chevron size-3.5"
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={t("askAven")}
          className="sf-menu-list"
        >
          {intents.map((intent) => (
            <Link
              key={intent}
              role="menuitem"
              tabIndex={-1}
              href={`/aven?goal=${goalId}&intent=${intent}&task=${encodeURIComponent(task.slice(0, 200))}`}
              onClick={() => setOpen(false)}
            >
              {t(`ask.${intent}`)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
