"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { runServerAction } from "@/lib/client/server-actions";
import { deleteMyAccount } from "@/app/[locale]/actions";
import { DatabaseIcon, DownloadIcon, TrashIcon } from "@/icons";
import { Modal } from "@/components/ui/modal";
import Field from "@/components/studyflow/FormFields";
import SettingsCard from "./SettingsCard";

interface Props { email: string }

/** Export is a calm, safe block; deletion lives apart in a clearly marked danger zone. */
export default function DataSection({ email }: Props) {
  const t = useTranslations("settings");
  const [deleting, setDeleting] = useState(false);
  return (
    <SettingsCard id="settings-data" icon={<DatabaseIcon />} title={t("data.title")} description={t("data.description")}>
      <div className="sf-set-row">
        <div className="sf-set-row-text">
          <p className="sf-set-label">{t("data.export")}</p>
          <p className="sf-set-help">{t("data.exportHelp")}</p>
        </div>
        <div className="sf-set-row-control">
          {/* A same-origin download link; the route only returns the signed-in learner's records. */}
          <a className="sf-set-button" data-variant="secondary" href="/api/export" download="acadence-data.json">
            <DownloadIcon aria-hidden="true" />{t("data.exportButton")}
          </a>
        </div>
      </div>
      <div className="sf-set-danger" role="group" aria-labelledby="settings-danger-title">
        <div className="min-w-0">
          <p id="settings-danger-title" className="sf-set-label">{t("data.dangerTitle")}</p>
          <p className="sf-set-help">{t("data.dangerHelp")}</p>
        </div>
        <button type="button" className="sf-set-button" data-variant="danger" onClick={() => setDeleting(true)}>
          <TrashIcon aria-hidden="true" />{t("data.delete")}
        </button>
      </div>
      <DeleteAccountDialog open={deleting} email={email} onClose={() => setDeleting(false)} />
    </SettingsCard>
  );
}

/** Deletion needs the user's email or the word DELETE typed exactly. */
function DeleteAccountDialog({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const t = useTranslations("settings");
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const matches = typed.trim() === "DELETE" || typed.trim().toLowerCase() === email.toLowerCase();
  const close = () => { if (pending) return; setTyped(""); setError(""); onClose(); };
  return (
    <Modal isOpen={open} onClose={close} title={t("data.confirmTitle")}>
      <form className="grid gap-4" onSubmit={async event => {
        event.preventDefault();
        if (!matches || pending) return;
        setPending(true); setError("");
        try {
          const result = await runServerAction(() => deleteMyAccount());
          if (!result.ok) { setError(t("data.deleteFailed")); return; }
          router.replace("/login");
        } catch { setError(t("data.deleteFailed")); }
        finally { setPending(false); }
      }}>
        <p className="text-body text-secondary dark:text-secondary">{t("data.confirmBody")}</p>
        <Field label={t("data.confirmLabel", { email })} value={typed} autoComplete="off" spellCheck={false} onChange={event => setTyped(event.target.value)} />
        {error && <p role="alert" className="sf-set-inline-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="sf-set-button" data-variant="ghost" onClick={close} disabled={pending}>{t("cancel")}</button>
          <button type="submit" className="sf-set-button" data-variant="danger-solid" disabled={!matches || pending} aria-busy={pending || undefined}>
            {pending ? t("data.deleting") : t("data.deleteForever")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
