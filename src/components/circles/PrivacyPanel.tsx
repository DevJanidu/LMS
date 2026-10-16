"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldIcon } from "@/icons";
import Switch from "@/components/ui/switch/Switch";
import SegmentedControl from "@/components/ui/SegmentedControl";
import AnalyticsCard from "@/components/analytics/AnalyticsCard";
import SettingRow from "@/components/settings/SettingRow";
import { circlesAction, useCircles } from "./useCircles";
import { PanelError, PanelSkeleton, useErrorText } from "./PanelState";
import type { Privacy } from "./types";

/** Who can send requests and what friends and group members can see. */
export default function PrivacyPanel() {
  const t = useTranslations("circles.privacy");
  const errorText = useErrorText();
  const loaded = useCircles<{ privacy: Privacy }>({ view: "privacy" });
  // Edits live in a draft; until the first edit the saved settings are shown.
  const [draft, setValue] = useState<Privacy | null>(null);
  const value = draft ?? loaded.data?.privacy ?? null;
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  if (loaded.loading && !value) return <PanelSkeleton rows={4} />;
  if (loaded.error || !value) return <PanelError code={loaded.error} onRetry={loaded.reload} />;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(loaded.data?.privacy);
  const toggle = (key: keyof Omit<Privacy, "activityVisibility">) => (checked: boolean) => setValue({ ...value, [key]: checked });
  return (
    <AnalyticsCard id="circles-privacy" title={t("title")} description={t("description")}>
      <div className="sc-privacy">
        <SettingRow id="circles-visibility" label={t("visibility")} description={t(`visibilityHelp.${value.activityVisibility}`)} stacked>
          <SegmentedControl aria-labelledby="circles-visibility-label" value={value.activityVisibility} onChange={activityVisibility => setValue({ ...value, activityVisibility })}
            options={(["private", "friends", "groups"] as const).map(option => ({ value: option, label: t(`visibilityOptions.${option}`) }))} />
        </SettingRow>
        {([["acceptRequests", "acceptRequestsHelp"], ["showOnLeaderboards", "leaderboardsHelp"], ["shareStreak", "streakHelp"], ["shareSubjects", "subjectsHelp"]] as const).map(([key, help]) => (
          <SettingRow key={key} id={`circles-${key}`} label={t(key)} description={t(help)}>
            <Switch id={`circles-${key}`} checked={value[key]} aria-describedby={`circles-${key}-help`} onCheckedChange={toggle(key)} />
          </SettingRow>
        ))}
        <p className="sc-note"><ShieldIcon aria-hidden="true" />{t("never")}</p>
        {status && <p role={status.tone === "error" ? "alert" : "status"} className={status.tone === "error" ? "sf-set-inline-error" : "sf-set-inline-success"}>{status.text}</p>}
        <div className="sf-set-actions">
          <button type="button" className="sf-set-button" data-variant="primary" disabled={!dirty || saving} aria-busy={saving || undefined}
            onClick={async () => {
              setSaving(true); setStatus(null);
              try { await circlesAction({ kind: "privacy", value }); await loaded.reload(); setValue(null); setStatus({ tone: "success", text: t("saved") }); }
              catch (cause) { setStatus({ tone: "error", text: errorText(cause) }); }
              finally { setSaving(false); }
            }}>{saving ? t("saving") : t("save")}</button>
          {dirty && <button type="button" className="sf-set-button" data-variant="ghost" onClick={() => setValue(null)}>{t("discard")}</button>}
        </div>
      </div>
    </AnalyticsCard>
  );
}
