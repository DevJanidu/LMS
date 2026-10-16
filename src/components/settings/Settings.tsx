"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "@/context/ThemeContext";
import { updateWorkspace, useWorkspace } from "@/lib/workspace/store";
import { featureRequest } from "@/lib/goals/client";
import { timezoneOptions } from "@/lib/timezone";
import useDeviceTimezone from "@/hooks/useDeviceTimezone";
import type { SettingsOverview } from "@/lib/services/settings-overview";
import type { NotificationPreferences } from "@/lib/aven/validation";
import type { Workspace } from "@/types";
import { BellIcon, CreditCardIcon, DatabaseIcon, LockIcon, ShieldIcon, SlidersIcon, UserCircleIcon } from "@/icons";
import SettingsNav from "./SettingsNav";
import ProfileSection from "./ProfileSection";
import PreferencesSection from "./PreferencesSection";
import NotificationsSection from "./NotificationsSection";
import SecuritySection from "./SecuritySection";
import PlanSection from "./PlanSection";
import DataSection from "./DataSection";
import UnsavedChangesBar from "./UnsavedChangesBar";
import SettingsToast from "./SettingsToast";
import { draftFrom, notificationsChanged, profileChanged, type SettingsDraft } from "./draft";

interface Props { initial: Workspace; overview: SettingsOverview }

/** Account, workspace and data settings with a single save bar for every editable field. */
export default function Settings({ initial, overview }: Props) {
  const t = useTranslations("settings");
  const names = useTranslations("marketing.pricing.plans");
  const data = useWorkspace(initial);
  const { setThemeMode } = useTheme();
  const deviceTimezone = useDeviceTimezone();
  const [saved, setSaved] = useState(() => draftFrom(data.user, overview.reminders?.notifications ?? null));
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [toast, setToast] = useState("");
  const zones = useMemo(() => [...new Set([draft.timezone, ...timezoneOptions(deviceTimezone)])], [deviceTimezone, draft.timezone]);
  const dirty = profileChanged(draft, saved) || notificationsChanged(draft, saved);

  const change = (patch: Partial<SettingsDraft>) => {
    // Theme previews immediately; Discard restores the saved one.
    if (patch.theme) setThemeMode(patch.theme);
    if (patch.name !== undefined) setNameError("");
    setError("");
    setDraft(current => ({ ...current, ...patch }));
  };
  const discard = () => { setThemeMode(saved.theme); setDraft(saved); setError(""); setNameError(""); };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) { setNameError(t("profile.nameRequired")); document.getElementById("settings-profile")?.scrollIntoView(); return; }
    const timezone = draft.timezoneMode === "device" ? deviceTimezone ?? draft.timezone : draft.timezone.trim();
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); }
    catch { setError(t("profile.invalidTimezone")); return; }
    setSaving(true); setError("");
    const next = { ...draft, name, timezone };
    try {
      if (profileChanged(next, saved)) {
        const ok = await updateWorkspace(initial, state => ({
          ...state,
          user: { ...state.user, name, timezone, timezoneMode: next.timezoneMode, theme: next.theme, weekStartDay: next.weekStartDay, weeklyTargetMinutes: next.weeklyTargetMinutes, reminders: next.reminders, updatedAt: new Date().toISOString() },
          users: state.users.map(user => user.id === state.user.id ? { ...user, name, timezone, timezoneMode: next.timezoneMode, theme: next.theme } : user),
        }));
        if (!ok) { setError(t("saveFailed")); return; }
      }
      if (next.notifications && overview.reminders && notificationsChanged(next, saved)) {
        const result = await featureRequest<{ preferences: { notifications: NotificationPreferences } }>("/api/aven", { kind: "preferences", ai: overview.reminders.ai, notifications: next.notifications });
        next.notifications = result.preferences.notifications;
      }
      setSaved(next); setDraft(next);
      setToast(t("saved"));
    } catch { setError(t("saveFailed")); }
    finally { setSaving(false); }
  };

  // Leaving with unsaved edits asks first (browser-native prompt).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const clearToast = useCallback(() => setToast(""), []);

  const groups = [
    { label: t("nav.account"), items: [
      { id: "settings-profile", label: t("profile.title"), icon: <UserCircleIcon /> },
      { id: "settings-security", label: t("security.title"), icon: <ShieldIcon /> },
      { id: "settings-plan", label: t("plan.title"), icon: <CreditCardIcon /> },
    ] },
    { label: t("nav.workspace"), items: [
      { id: "settings-preferences", label: t("preferences.title"), icon: <SlidersIcon /> },
      { id: "settings-notifications", label: t("notifications.title"), icon: <BellIcon /> },
    ] },
    { label: t("nav.data"), items: [{ id: "settings-data", label: t("data.title"), icon: <DatabaseIcon /> }] },
  ];
  return (
    <div className="sf-set-page">
      <div className="sf-set-layout">
        <SettingsNav label={t("nav.label")} groups={groups} />
        {/* The title sits in the content column, so the section nav starts where it sticks and never moves. */}
        <div className="sf-set-main">
          <header className="sf-set-header">
            <div className="min-w-0">
              <h1 className="sf-set-page-title">{t("title")}</h1>
              <p className="sf-set-page-subtitle">{t("subtitle")}</p>
            </div>
            {overview.plan && (overview.plan.id === "free" ? (
              <Link href="/billing" className="sf-set-plan-pill">
                {t("planPill", { plan: names("free.name") })}
                <span className="sf-set-plan-pill-cta">{t("plan.upgrade")}</span>
              </Link>
            ) : (
              <a href="#settings-plan" className="sf-set-plan-pill">{t("planPill", { plan: names(`${overview.plan.id}.name`) })}</a>
            ))}
          </header>
        <div className="sf-set-sections">
          <ProfileSection draft={draft} onChange={change} email={data.user.email} account={overview.account} deviceTimezone={deviceTimezone ?? null} zones={zones} nameError={nameError} />
          <SecuritySection />
          <PlanSection plan={overview.plan} usage={overview.usage} storageLimitMB={data.settings.storagePerUserMB} />
          <PreferencesSection draft={draft} onChange={change} />
          <NotificationsSection draft={draft} onChange={change} emailConfigured={overview.reminders?.emailConfigured ?? false} pushConfigured={overview.reminders?.pushConfigured ?? false} />
          <DataSection email={data.user.email} />
          <p className="sf-set-footnote"><LockIcon aria-hidden="true" />{t("footnote")}</p>
        </div>
        </div>
      </div>
      <UnsavedChangesBar visible={dirty || Boolean(error)} saving={saving} error={error} onDiscard={discard} onSave={() => void save()} />
      {toast && <SettingsToast message={toast} onDone={clearToast} />}
    </div>
  );
}
