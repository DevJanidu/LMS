"use client";
import { useTranslations } from "next-intl";

interface Props {
  visible: boolean;
  saving: boolean;
  error?: string;
  onDiscard: () => void;
  onSave: () => void;
}

/** Floating bar shown only while the form differs from what is saved. */
export default function UnsavedChangesBar({ visible, saving, error, onDiscard, onSave }: Props) {
  const t = useTranslations("settings");
  if (!visible) return null;
  return (
    <div className="sf-set-savebar" role="region" aria-label={t("unsavedChanges")}>
      <p className="sf-set-savebar-text">
        <span className="sf-set-savebar-dot" aria-hidden="true" />
        {error || t("unsavedChanges")}
      </p>
      <div className="sf-set-savebar-actions">
        <button type="button" className="sf-set-button" data-variant="ghost" onClick={onDiscard} disabled={saving}>
          {t("discard")}
        </button>
        <button type="button" className="sf-set-button" data-variant="primary" onClick={onSave} disabled={saving} aria-busy={saving || undefined}>
          {saving ? t("saving") : t("saveChanges")}
        </button>
      </div>
    </div>
  );
}
