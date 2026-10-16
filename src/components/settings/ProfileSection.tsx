"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { UserCircleIcon, ExternalLinkIcon, CheckIcon } from "@/icons";
import Field from "@/components/studyflow/FormFields";
import ComboboxField from "@/components/form/ComboboxField";
import Switch from "@/components/ui/switch/Switch";
import SettingsCard from "./SettingsCard";
import SettingRow from "./SettingRow";
import type { DraftChange, SettingsDraft } from "./draft";

interface Props {
  draft: SettingsDraft;
  onChange: DraftChange;
  email: string;
  account: { image: string | null; emailVerified: boolean; memberSince: string };
  /** Zone the device reports; used while the timezone is set automatically. */
  deviceTimezone: string | null;
  zones: string[];
  nameError?: string;
}

export default function ProfileSection({ draft, onChange, email, account, deviceTimezone, zones, nameError }: Props) {
  const t = useTranslations("settings");
  const zone = draft.timezoneMode === "device" ? deviceTimezone ?? draft.timezone : draft.timezone;
  const initials = draft.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "?";
  return (
    <SettingsCard id="settings-profile" icon={<UserCircleIcon />} title={t("profile.title")} description={t("profile.description")}>
      <div className="sf-set-identity">
        <span className="sf-set-avatar" data-size="lg">
          {/* Google profile photos are served from Google's image host (allowed by the CSP). */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a 72px remote avatar needs no optimizer round trip */}
          {account.image ? <img src={account.image} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initials}</span>}
        </span>
        <div className="min-w-0">
          <p className="sf-set-identity-name">{draft.name || email}</p>
          <p className="sf-set-help">{t("profile.memberSince", { date: new Date(account.memberSince) })}</p>
          <p className="sf-set-help">{t("profile.photoSource")}</p>
        </div>
      </div>
      <div className="sf-set-grid">
        <div>
          <Field label={t("profile.name")} name="name" required maxLength={150} value={draft.name} onChange={event => onChange({ name: event.target.value })} aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? "settings-name-error" : undefined} />
          {nameError && <p id="settings-name-error" role="alert" className="sf-set-error">{nameError}</p>}
        </div>
        <div className="sf-set-readonly">
          <p className="sf-set-label" id="settings-email-label">{t("profile.email")}</p>
          <p className="sf-set-readonly-value" aria-labelledby="settings-email-label">
            <span className="truncate">{email}</span>
            {account.emailVerified && <span className="sf-set-badge" data-tone="success"><CheckIcon aria-hidden="true" />{t("profile.verified")}</span>}
          </p>
          <p className="sf-set-help">
            {t("profile.emailManaged")}{" "}
            <a className="sf-set-link" href="https://myaccount.google.com/personal-info" target="_blank" rel="noreferrer">
              {t("profile.manageGoogle")}<ExternalLinkIcon aria-hidden="true" />
            </a>
          </p>
        </div>
      </div>
      <SettingRow id="settings-timezone-auto" label={t("profile.timezoneAuto")} description={<LiveTime zone={zone} />}>
        <Switch id="settings-timezone-auto" checked={draft.timezoneMode === "device"} aria-describedby="settings-timezone-auto-help"
          onCheckedChange={automatic => onChange(automatic ? { timezoneMode: "device" } : { timezoneMode: "manual", timezone: zone })} />
      </SettingRow>
      {draft.timezoneMode === "manual" && (
        <div className="sf-set-reveal">
          <ComboboxField label={t("profile.timezone")} name="timezone" required value={draft.timezone} options={zones} onChange={event => onChange({ timezone: event.target.value })} />
        </div>
      )}
    </SettingsCard>
  );
}

/** "Asia/Colombo · 3:42 PM", rendered after mount so server and browser clocks never disagree. */
function LiveTime({ zone }: { zone: string }) {
  const t = useTranslations("settings");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, []);
  let time = "";
  try { time = now ? new Intl.DateTimeFormat("en", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(now) : ""; }
  catch { return <span>{t("profile.invalidTimezone")}</span>; }
  return <span className="tabular-nums">{time ? t("profile.localTime", { zone, time }) : zone}</span>;
}
