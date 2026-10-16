"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { runServerAction } from "@/lib/client/server-actions";
import { listMySessions, signOutDevice, signOutEverywhere, signOutOtherDevices, type SignedInDevice } from "@/app/[locale]/auth-actions";
import { ExternalLinkIcon, GoogleIcon, MonitorIcon, ShieldIcon, SmartphoneIcon } from "@/icons";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import SettingsCard from "./SettingsCard";

type Confirm = "others" | "all" | null;

/** Sign-in method, signed-in devices and server-side sign-out. */
export default function SecuritySection() {
  const t = useTranslations("settings");
  const router = useRouter();
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const result = await runServerAction(() => listMySessions());
      if (result.ok) setDevices(result.devices); else setLoadFailed(true);
    } catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const others = devices?.filter(device => !device.current).length ?? 0;

  const endOne = async (device: SignedInDevice) => {
    setPending(device.id); setStatus(null);
    try {
      const result = await runServerAction(() => signOutDevice(device.id));
      if (!result.ok) { setStatus({ tone: "error", text: t("security.signOutFailed") }); return; }
      setDevices(current => current?.filter(item => item.id !== device.id) ?? null);
      setStatus({ tone: "success", text: t("security.deviceSignedOut", { device: label(device) }) });
    } catch { setStatus({ tone: "error", text: t("security.signOutFailed") }); }
    finally { setPending(null); }
  };
  const endMany = async (scope: "others" | "all") => {
    setStatus(null);
    const result = await runServerAction(() => scope === "all" ? signOutEverywhere() : signOutOtherDevices());
    if (!result.ok) return false;
    if (scope === "all") { router.replace("/login"); return true; }
    setDevices(current => current?.filter(device => device.current) ?? null);
    setStatus({ tone: "success", text: t("security.othersSignedOut") });
    return true;
  };
  const label = (device: SignedInDevice) =>
    device.browser && device.os ? t("security.browserOn", { browser: device.browser, os: device.os }) : device.browser ?? device.os ?? t("security.unknownDevice");

  return (
    <SettingsCard id="settings-security" icon={<ShieldIcon />} title={t("security.title")} description={t("security.description")}
      status={<p className="sf-set-status" data-tone="success"><span className="sf-set-status-dot" aria-hidden="true" />{t("security.protected")}</p>}>
      <div className="sf-set-row">
        <div className="sf-set-row-text">
          <p className="sf-set-label">{t("security.method")}</p>
          <p className="sf-set-help">{t("security.methodHelp")}</p>
        </div>
        <div className="sf-set-row-control">
          <span className="sf-set-method"><GoogleIcon aria-hidden="true" />Google</span>
          <a className="sf-set-link" href="https://myaccount.google.com/security" target="_blank" rel="noreferrer">
            {t("security.manageGoogle")}<ExternalLinkIcon aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="sf-set-block">
        <p className="sf-set-label" id="settings-devices-label">{t("security.devices")}</p>
        {loadFailed ? (
          <p role="alert" className="sf-set-inline-error">
            {t("security.devicesUnavailable")}{" "}
            <button type="button" className="sf-set-link" onClick={() => void load()}>{t("retry")}</button>
          </p>
        ) : !devices ? (
          <ul className="sf-set-devices" aria-busy="true" aria-labelledby="settings-devices-label">
            {[0, 1].map(key => <li key={key} className="sf-set-device"><span className="sf-set-skeleton" data-shape="tile" /><span className="sf-set-skeleton" /></li>)}
          </ul>
        ) : (
          <ul className="sf-set-devices" aria-labelledby="settings-devices-label">
            {devices.map(device => (
              <li key={device.id} className="sf-set-device">
                <span className="sf-set-device-icon" aria-hidden="true">{device.mobile ? <SmartphoneIcon /> : <MonitorIcon />}</span>
                <div className="min-w-0 flex-1">
                  <p className="sf-set-device-name">
                    {label(device)}
                    {device.current && <span className="sf-set-badge" data-tone="brand">{t("security.thisDevice")}</span>}
                  </p>
                  <p className="sf-set-help">
                    {device.current ? <><span className="sf-set-status-dot" aria-hidden="true" />{t("security.activeNow")}</> : t("security.lastActive", { date: new Date(device.lastActiveAt) })}
                    {" · "}{t("security.signedIn", { date: new Date(device.signedInAt) })}
                  </p>
                </div>
                {!device.current && (
                  <button type="button" className="sf-set-text-button" disabled={pending === device.id} aria-label={t("security.signOutDevice", { device: label(device) })} onClick={() => void endOne(device)}>
                    {pending === device.id ? t("security.signingOut") : t("security.signOut")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {status && <p role={status.tone === "error" ? "alert" : "status"} className={status.tone === "error" ? "sf-set-inline-error" : "sf-set-inline-success"}>{status.text}</p>}
      <div className="sf-set-actions">
        <button type="button" className="sf-set-button" data-variant="secondary" disabled={devices !== null && others === 0} onClick={() => setConfirm("others")}>{t("security.signOutOthers")}</button>
        <button type="button" className="sf-set-button" data-variant="danger" onClick={() => setConfirm("all")}>{t("security.signOutEverywhere")}</button>
      </div>
      <ConfirmDialog background={false} isOpen={confirm === "others"} onClose={() => setConfirm(null)} title={t("security.confirmOthersTitle")} description={t("security.confirmOthers")}
        onConfirm={() => endMany("others")} />
      <ConfirmDialog background={false} isOpen={confirm === "all"} onClose={() => setConfirm(null)} title={t("security.confirmAllTitle")} description={t("security.confirmAll")}
        onConfirm={() => endMany("all")} />
    </SettingsCard>
  );
}
