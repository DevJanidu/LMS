"use client";
import { useTranslations } from "next-intl";
import { BellIcon } from "@/icons";
import { Link } from "@/i18n/navigation";
import Switch from "@/components/ui/switch/Switch";
import type { NotificationPreferences } from "@/lib/aven/validation";
import SettingsCard from "./SettingsCard";
import SettingRow from "./SettingRow";
import type { DraftChange, SettingsDraft } from "./draft";

interface Props {
  draft: SettingsDraft;
  onChange: DraftChange;
  emailConfigured: boolean;
  pushConfigured: boolean;
}
const LEAD_MINUTES = [0, 5, 10, 15, 30, 60];
type Toggle = "sessionReminders" | "missedSessions" | "goalReminders" | "weekly";

export default function NotificationsSection({ draft, onChange, emailConfigured, pushConfigured }: Props) {
  const t = useTranslations("settings");
  const prefs = draft.notifications;
  const update = (patch: Partial<NotificationPreferences>) => prefs && onChange({ notifications: { ...prefs, ...patch } });
  const soon = <span className="sf-set-badge">{t("comingSoon")}</span>;
  return (
    <SettingsCard id="settings-notifications" icon={<BellIcon />} title={t("notifications.title")} description={t("notifications.description")}>
      <SettingRow id="settings-in-app" label={t("notifications.inApp")} description={t("notifications.inAppHelp")}>
        <Switch id="settings-in-app" checked={draft.reminders} aria-describedby="settings-in-app-help" onCheckedChange={reminders => onChange({ reminders })} />
      </SettingRow>
      {!prefs ? (
        <p role="alert" className="sf-set-inline-error">{t("notifications.unavailable")}</p>
      ) : (
        <>
          <SettingRow id="settings-study-reminders" label={t("notifications.studyReminders")} description={t("notifications.studyRemindersHelp")}>
            <Switch id="settings-study-reminders" checked={prefs.enabled} aria-describedby="settings-study-reminders-help" onCheckedChange={enabled => update({ enabled })} />
          </SettingRow>
          {prefs.enabled && (
            <div className="sf-set-reveal sf-set-subgroup">
              <p className="sf-set-overline">{t("notifications.remindAbout")}</p>
              {(["sessionReminders", "missedSessions", "goalReminders", "weekly"] as Toggle[]).map(key => (
                <SettingRow key={key} id={`settings-${key}`} label={t(`notifications.kinds.${key}`)} description={t(`notifications.kinds.${key}Help`)}>
                  <Switch id={`settings-${key}`} checked={prefs[key]} aria-describedby={`settings-${key}-help`} onCheckedChange={value => update({ [key]: value })} />
                </SettingRow>
              ))}
              <SettingRow id="settings-lead" label={t("notifications.lead")} disabled={!prefs.sessionReminders}>
                <select id="settings-lead" className="sf-set-select tabular-nums" value={prefs.leadMinutes} disabled={!prefs.sessionReminders} onChange={event => update({ leadMinutes: Number(event.target.value) })}>
                  {LEAD_MINUTES.map(minutes => <option key={minutes} value={minutes}>{minutes ? t("notifications.minutesBefore", { minutes }) : t("notifications.atStart")}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="settings-quiet-start" label={t("notifications.quietHours")} description={t("notifications.quietHoursHelp")}>
                <span className="sf-set-range">
                  <input id="settings-quiet-start" type="time" className="sf-set-time" value={prefs.quietStart} aria-label={t("notifications.quietFrom")} onChange={event => event.target.value && update({ quietStart: event.target.value })} />
                  <span aria-hidden="true">–</span>
                  <input type="time" className="sf-set-time" value={prefs.quietEnd} aria-label={t("notifications.quietTo")} onChange={event => event.target.value && update({ quietEnd: event.target.value })} />
                </span>
              </SettingRow>
              <p className="sf-set-overline">{t("notifications.channels")}</p>
              <SettingRow id="settings-channel-inapp" label={t("notifications.channelInApp")}>
                <Switch id="settings-channel-inapp" checked={prefs.inApp} onCheckedChange={inApp => update({ inApp })} />
              </SettingRow>
              <SettingRow id="settings-channel-email" label={t("notifications.channelEmail")} description={emailConfigured ? undefined : t("notifications.emailUnavailable")} disabled={!emailConfigured}>
                <Switch id="settings-channel-email" checked={emailConfigured && prefs.email} disabled={!emailConfigured} onCheckedChange={email => update({ email })} />
              </SettingRow>
              <SettingRow id="settings-channel-push" label={t("notifications.channelPush")} badge={pushConfigured ? undefined : soon}
                description={pushConfigured ? (prefs.push ? t("notifications.pushOn") : t("notifications.pushSetup")) : undefined} disabled={!pushConfigured}>
                {pushConfigured && <Link href="/aven" className="sf-set-link">{t("notifications.pushManage")}</Link>}
              </SettingRow>
            </div>
          )}
        </>
      )}
      <SettingRow id="settings-news" label={t("notifications.productNews")} badge={soon} disabled>
        <Switch id="settings-news" checked={false} disabled onCheckedChange={() => {}} />
      </SettingRow>
    </SettingsCard>
  );
}
