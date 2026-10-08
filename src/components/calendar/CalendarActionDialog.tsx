"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { SelectField } from "@/components/studyflow/FormFields";
import type { BlockOccurrence } from "@/lib/schedule";

export type CalendarAction = { kind: "move" | "delete"; occurrence: BlockOccurrence; startsAt?: string; endsAt?: string; revert?: () => void };
type Scope = "one" | "future" | "all";
export default function CalendarActionDialog({ action, onClose, onConfirm }: { action: CalendarAction; onClose: () => void; onConfirm: (scope: Scope) => void }) {
  const t = useTranslations("studyflow");
  const [scope, setScope] = useState<Scope>("one");
  const recurring = action.occurrence.block.repeat === "weekly";
  return <Modal isOpen onClose={onClose} title={t(action.kind === "delete" ? "deleteBlock" : "planner.moveRecurring")}>
    <p className="mb-5 text-body text-secondary dark:text-secondary">{action.occurrence.title}</p>
    {recurring && <SelectField label={t("repeatScope")} value={scope} onChange={event => setScope(event.target.value as Scope)}>
      <option value="one">{t("thisOne")}</option><option value="future">{t("allFuture")}</option><option value="all">{t("planner.allSeries")}</option>
    </SelectField>}
    <div className="mt-6 flex justify-end gap-3">
      <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
      <Button onClick={() => onConfirm(scope)}>{t("confirm")}</Button>
    </div>
  </Modal>;
}
