"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Field from "@/components/studyflow/FormFields";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useErrorText } from "./PanelState";

export interface GroupValue { name: string; description: string; color: "brand" | "success" | "orange" | "purple" }
interface Props { open: boolean; title: string; submitLabel: string; initial?: GroupValue; onClose: () => void; onSubmit: (value: GroupValue) => Promise<void> }

/** Create or edit a group; the dialog stays open with the error if saving fails. */
export default function GroupForm({ open, title, submitLabel, initial, onClose, onSubmit }: Props) {
  const t = useTranslations("circles.groups");
  const errorText = useErrorText();
  const [value, setValue] = useState<GroupValue>(initial ?? { name: "", description: "", color: "brand" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal isOpen={open} onClose={pending ? () => {} : onClose} title={title}>
      <form className="grid gap-4" onSubmit={async event => {
        event.preventDefault();
        if (pending || !value.name.trim()) return;
        setPending(true); setError("");
        try { await onSubmit({ ...value, name: value.name.trim(), description: value.description.trim() }); onClose(); }
        catch (cause) { setError(errorText(cause)); }
        finally { setPending(false); }
      }}>
        <Field label={t("name")} required maxLength={80} value={value.name} placeholder={t("namePlaceholder")} onChange={event => setValue(current => ({ ...current, name: event.target.value }))} />
        <Field label={t("about")} maxLength={280} value={value.description} placeholder={t("aboutPlaceholder")} onChange={event => setValue(current => ({ ...current, description: event.target.value }))} />
        <div className="grid gap-2">
          <p className="sf-set-label" id="circles-group-color">{t("color")}</p>
          <SegmentedControl aria-labelledby="circles-group-color" value={value.color} onChange={color => setValue(current => ({ ...current, color }))}
            options={(["brand", "success", "orange", "purple"] as const).map(color => ({ value: color, label: t(`colors.${color}`) }))} />
        </div>
        {error && <p role="alert" className="sf-set-inline-error">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="sf-set-button" data-variant="ghost" onClick={onClose} disabled={pending}>{t("cancel")}</button>
          <button type="submit" className="sf-set-button" data-variant="primary" disabled={pending || !value.name.trim()} aria-busy={pending || undefined}>{pending ? t("saving") : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}
