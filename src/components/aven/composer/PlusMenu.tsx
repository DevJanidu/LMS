"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "@/icons";
import {
  availabilityOf,
  plusItems,
  type ComposerAction,
  type ComposerEnvironment,
} from "@/lib/aven/composer-registry";
import { moveActive } from "../composer-model";
import ComposerMenu, { type MenuRow } from "./ComposerMenu";
import { useMenuPlacement } from "./useMenuPlacement";
export interface SubjectChoice {
  id: string;
  label: string;
}
interface Props {
  env: ComposerEnvironment;
  disabled: boolean;
  anchor: RefObject<HTMLElement | null>;
  loadSubjects: () => Promise<SubjectChoice[]>;
  onAction: (action: ComposerAction, subjectId?: string) => void;
}
/** The "+" menu: attach files, pick from the library, and quick starts. */
export default function PlusMenu({ env, disabled, anchor, loadSubjects, onAction }: Props) {
  const t = useTranslations("aven.composerItems"),
    a = useTranslations("aven.attachments"),
    id = useId(),
    menuId = `${id}-plus`,
    button = useRef<HTMLButtonElement>(null),
    container = useRef<HTMLDivElement>(null),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(0),
    [subjects, setSubjects] = useState<SubjectChoice[] | null>(null),
    [status, setStatus] = useState("");
  const placement = useMenuPlacement(anchor, open);
  const close = (refocus = true) => {
    setOpen(false);
    setSubjects(null);
    setStatus("");
    if (refocus) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (container.current?.contains(event.target as Node)) return;
      setOpen(false);
      setSubjects(null);
      setStatus("");
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const rows: MenuRow[] = subjects
    ? subjects.map((subject) => ({ key: subject.id, icon: "folder", label: subject.label, description: "" }))
    : plusItems.map((item) => {
        const availability = availabilityOf(item, env);
        return {
          key: item.id,
          icon: item.icon,
          label: t(`${item.id}.label`),
          description: availability.available ? t(`${item.id}.description`) : t(`reasons.${availability.reason}`),
          disabled: !availability.available,
          submenu: item.action?.type === "attachFiles",
        };
      });
  const select = async (index: number) => {
    if (subjects) {
      const subject = subjects[index];
      if (subject) {
        close(false);
        onAction({ type: "attachFiles" }, subject.id);
      }
      return;
    }
    const item = plusItems[index];
    if (!item?.action || !availabilityOf(item, env).available) return;
    if (item.action.type !== "attachFiles") {
      close(false);
      onAction(item.action);
      return;
    }
    // Files belong to a subject: pick one first unless there is only one.
    const choices = await loadSubjects().catch(() => []);
    if (!choices.length) setStatus(a("noSubject"));
    else if (choices.length === 1) {
      close(false);
      onAction(item.action, choices[0].id);
    } else {
      setSubjects(choices);
      setActive(0);
    }
  };
  const keyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => moveActive(index, event.key === "ArrowDown" ? 1 : -1, rows.length));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : rows.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void select(active);
    } else if (event.key === "ArrowLeft" && subjects) {
      event.preventDefault();
      setSubjects(null);
      setActive(0);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (subjects) {
        setSubjects(null);
        setActive(0);
      } else close();
    } else if (event.key === "Tab") close(false);
  };
  return (
    <div ref={container} className="aven-plus">
      <button
        ref={button}
        type="button"
        className="aven-icon-button aven-plus-button"
        aria-label={t("openTools")}
        title={t("openTools")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else {
            setActive(0);
            setOpen(true);
          }
        }}
      >
        <PlusIcon className="size-5" />
      </button>
      {open && (
        <ComposerMenu
          id={menuId}
          label={t("toolsLabel")}
          role="menu"
          rows={rows}
          activeIndex={Math.min(active, rows.length - 1)}
          side={placement.side}
          maxHeight={placement.maxHeight}
          status={status || undefined}
          parent={subjects ? { label: a("subject"), onBack: () => setSubjects(null) } : undefined}
          onSelect={(index) => void select(index)}
          onHover={setActive}
          onKeyDown={keyDown}
        />
      )}
    </div>
  );
}
