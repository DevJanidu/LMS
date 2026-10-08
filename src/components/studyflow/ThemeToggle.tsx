"use client";

import { type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { MoonIcon, SunIcon } from "@/icons";
import { useTheme } from "@/context/ThemeContext";

interface Props {
  label: string;
  className?: string;
  children?: ReactNode;
  onChange?: (theme: "light" | "dark") => void;
  stateLabels?: { light: string; dark: string };
}

let activeTransition: ViewTransition | null = null;
let requestedTheme: "light" | "dark" | null = null;

function clearReveal() {
  const root = document.documentElement;
  delete root.dataset.sfThemeReveal;
  root.style.removeProperty("--sf-theme-reveal-x");
  root.style.removeProperty("--sf-theme-reveal-y");
  root.style.removeProperty("--sf-theme-reveal-radius");
}

export default function ThemeToggle({ label, className, children, onChange, stateLabels }: Props) {
  const { theme, setThemeMode } = useTheme();
  const Icon = theme === "dark" ? SunIcon : MoonIcon;

  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    const root = document.documentElement;
    const icon = event.currentTarget.querySelector("svg");
    const rect = (icon ?? event.currentTarget).getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const previous = requestedTheme ?? (root.classList.contains("dark") ? "dark" : "light");
    const next = previous === "dark" ? "light" : "dark";
    requestedTheme = next;
    const change = () => flushSync(() => setThemeMode(next));

    try { activeTransition?.skipTransition(); } catch { /* Already finished. */ }
    activeTransition = null;
    if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearReveal();
      change();
      requestedTheme = null;
      onChange?.(next);
      return;
    }

    root.style.setProperty("--sf-theme-reveal-x", `${x}px`);
    root.style.setProperty("--sf-theme-reveal-y", `${y}px`);
    root.style.setProperty("--sf-theme-reveal-radius", `${radius}px`);
    root.dataset.sfThemeReveal = next;
    let transition: ViewTransition;
    try {
      transition = document.startViewTransition(change);
    } catch {
      clearReveal();
      change();
      requestedTheme = null;
      onChange?.(next);
      return;
    }
    activeTransition = transition;
    onChange?.(next);
    const finish = () => {
      if (activeTransition !== transition) return;
      activeTransition = null;
      requestedTheme = null;
      clearReveal();
    };
    void transition.finished.then(finish, finish);
  };

  return (
    <button type="button" onClick={toggle} aria-label={label} className={className} data-theme-toggle>
      <Icon key={theme} className="sf-theme-toggle-icon" />
      {children}
      {stateLabels && <span className="text-muted ms-auto">{stateLabels[theme]}</span>}
    </button>
  );
}
