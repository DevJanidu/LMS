"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { signOut } from "@/app/[locale]/auth-actions";
import { AppUpdatedError, runServerAction } from "@/lib/client/server-actions";
import { useTheme } from "@/context/ThemeContext";
import { useSaveTheme } from "./AccountThemeContext";
import { CreditCardIcon, LogOutIcon, MonitorIcon, MoonIcon, MoreIcon, SettingsIcon, SparklesIcon, SunIcon } from "@/icons";

export interface SidebarAccountProps {
  name: string;
  email: string;
  image: string | null;
  admin: boolean;
  /** Localized plan name; undefined while loading or for administrators. */
  planName?: string;
  showUpgrade?: boolean;
}

/** Who is signed in, their plan, and account actions in one compact menu. */
export default function SidebarAccount({ name, email, image, admin, planName, showUpgrade }: SidebarAccountProps) {
  const t = useTranslations("studyflow");
  const s = useTranslations("sidebar");
  const router = useRouter();
  const { themeMode, setThemeMode } = useTheme();
  const saveTheme = useSaveTheme();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>("[role=menuitem], [role=menuitemradio]")?.focus();
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); button.current?.focus(); return; }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem], [role=menuitemradio]") ?? [])];
      const index = items.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keys);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", keys); };
  }, [open]);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
  const leave = async () => {
    setBusy(true); setError("");
    try { await runServerAction(() => signOut()); router.replace("/login"); }
    catch (cause) { setError(t(cause instanceof AppUpdatedError ? "appUpdatedTitle" : "saveFailed")); setBusy(false); }
  };
  const themes = [{ mode: "light", icon: <SunIcon /> }, { mode: "dark", icon: <MoonIcon /> }, { mode: "auto", icon: <MonitorIcon /> }] as const;
  return (
    <div className="sf-account" ref={root}>
      {showUpgrade && (
        <Link href="/billing" className="sf-upgrade">
          <SparklesIcon aria-hidden="true" />
          <span><strong>{s("upgradeTitle")}</strong><span>{s("upgradeBody")}</span></span>
        </Link>
      )}
      <button ref={button} type="button" className="sf-account-card" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId}
        aria-label={s("accountMenu", { name })} data-tooltip={name} onClick={() => setOpen(value => !value)}>
        <span className="sf-account-avatar">
          {/* eslint-disable-next-line @next/next/no-img-element -- a 32px remote avatar needs no optimizer round trip */}
          {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initials}</span>}
        </span>
        <span className="sf-account-text sf-nav-label">
          <span className="sf-account-name">{name}</span>
          <span className="sf-account-meta">{admin ? t("admin") : planName ? <span className="sf-account-plan">{planName}</span> : email}</span>
        </span>
        <MoreIcon className="sf-account-more sf-nav-label" aria-hidden="true" />
      </button>
      {/* Kept in the DOM (hidden) so the menu target exists for aria-controls. */}
      {(
        <div id={menuId} role="menu" hidden={!open} aria-label={s("accountMenu", { name })} className="sf-account-menu">
          <Link role="menuitem" href={admin ? "/admin/settings" : "/settings"} onClick={() => setOpen(false)}><SettingsIcon aria-hidden="true" />{t("settings")}</Link>
          {!admin && <Link role="menuitem" href="/billing" onClick={() => setOpen(false)}><CreditCardIcon aria-hidden="true" />{s("billing")}</Link>}
          <div role="group" aria-label={t("theme")} className="sf-account-themes">
            {themes.map(({ mode, icon }) => (
              <button key={mode} type="button" role="menuitemradio" aria-checked={themeMode === mode} aria-label={t(mode)} title={t(mode)} onClick={() => { setThemeMode(mode); saveTheme?.(mode); }}>{icon}</button>
            ))}
          </div>
          <button type="button" role="menuitem" disabled={busy} onClick={() => void leave()}><LogOutIcon aria-hidden="true" />{t("logout")}</button>
          {error && <p role="alert" className="sf-account-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
