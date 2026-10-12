"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDownIcon } from "@/icons";
interface Props {
  label: string;
  children: ReactNode;
}
export default function GoalActionMenu({ label, children }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return (
    <details
      ref={menu}
      className="goal-menu"
      onClick={(event) => {
        if ((event.target as Element).closest("button,a"))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current?.open) {
          event.preventDefault();
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={label}>
        <ChevronDownIcon className="size-4" />
      </summary>
      <div className="goal-menu-content">{children}</div>
    </details>
  );
}
