"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Field, { TextField } from "@/components/studyflow/FormFields";
import Button from "@/components/ui/button/Button";
import { milestoneSchema, type MilestoneInput } from "@/lib/goals/validation";
import type { GoalMilestone } from "@/lib/goals/model";
import GoalLinksField from "./GoalLinksField";
interface Props {
  milestone?: GoalMilestone;
  milestones: GoalMilestone[];
  onClose: () => void;
  onSave: (id: string, value: MilestoneInput) => Promise<void>;
}
export default function MilestoneEditor({
  milestone,
  milestones,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("goals"),
    [id] = useState(() => milestone?.id ?? crypto.randomUUID()),
    [dependencies, setDependencies] = useState(milestone?.dependencyIds ?? []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(milestone ? "editMilestone" : "addMilestone")}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const fields = new FormData(event.currentTarget);
          const value = milestoneSchema.safeParse({
            title: fields.get("title"),
            description: fields.get("description"),
            dueDate: fields.get("dueDate") || null,
            weight: Number(fields.get("weight")),
            sortOrder: Number(fields.get("sortOrder")),
            dependencyIds: dependencies,
          });
          if (!value.success) {
            setError(t("errors.invalidInput"));
            return;
          }
          setBusy(true);
          try {
            await onSave(id, value.data);
          } catch (error) {
            const key = (error as Error).message;
            setError(
              t.has(`errors.${key}`)
                ? t(`errors.${key}`)
                : t("errors.serviceUnavailable"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field
          label={t("fields.title")}
          name="title"
          required
          defaultValue={milestone?.title}
        />
        <TextField
          label={t("fields.description")}
          name="description"
          defaultValue={milestone?.description}
        />
        <Field
          label={t("fields.dueDate")}
          name="dueDate"
          type="date"
          defaultValue={milestone?.dueDate ?? ""}
        />
        <Field
          label={t("fields.weight")}
          name="weight"
          type="number"
          min={1}
          max={1000}
          defaultValue={milestone?.weight ?? 1}
        />
        <Field
          label={t("fields.sortOrder")}
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={milestone?.sortOrder ?? milestones.length}
        />
        <GoalLinksField
          label={t("fields.dependencies")}
          options={milestones.filter((m) => m.id !== milestone?.id)}
          value={dependencies}
          onChange={setDependencies}
        />
        {error && (
          <p
            role="alert"
            className="text-small text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {t(busy ? "saving" : "save")}
        </Button>
      </form>
    </Modal>
  );
}
