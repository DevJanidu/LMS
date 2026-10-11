"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import Field from "@/components/studyflow/FormFields";
import Button from "@/components/ui/button/Button";
import SmartGoalAssistant from "@/components/aven/SmartGoalAssistant";
import { goalSchema, type GoalInput } from "@/lib/goals/validation";
import type { GoalRecord } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import { localDay, shiftDay } from "@/lib/analytics";
interface Props {
  goal?: GoalRecord;
  references: GoalReferences;
  onClose: () => void;
  onSave: (value: GoalInput) => Promise<void>;
}
export default function GoalEditor({
  goal,
  references,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("goals"),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState<Record<string, unknown>>();
  const form = useRef<HTMLFormElement>(null);
  const today = localDay(Date.now(), references.timezone);
  return (
    <Modal isOpen onClose={onClose} title={t(goal ? "editGoal" : "createGoal")}>
      <form
        ref={form}
        className="space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const fields = new FormData(event.currentTarget),
            targetDate = String(fields.get("targetDate") ?? "");
          const result = goalSchema.safeParse({
            ...goal,
            title: fields.get("title"),
            targetDate,
            startDate:
              goal?.startDate && goal.startDate <= targetDate
                ? goal.startDate
                : targetDate < today
                  ? targetDate
                  : today,
            progressMode: goal?.progressMode ?? "outcome",
          });
          if (!result.success) {
            setError(t("errors.invalidInput"));
            return;
          }
          setBusy(true);
          setError("");
          try {
            await onSave(result.data);
          } catch (error) {
            const key = (error as Error).message;
            setError(
              t.has("errors." + key)
                ? t("errors." + key)
                : t("errors.serviceUnavailable"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-secondary dark:text-secondary text-small">
          {t("simpleGoalHelp")}
        </p>
        <Field
          label={t("goalName")}
          name="title"
          required
          maxLength={200}
          defaultValue={goal?.title}
        />
        <Field
          label={t("dueDate")}
          name="targetDate"
          type="date"
          required
          defaultValue={goal?.targetDate ?? shiftDay(today, 30)}
        />
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {t(busy ? "saving" : "save")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!form.current) return;
              const values = new FormData(form.current);
              setDraft({
                title: String(values.get("title") ?? ""),
                targetDate: String(values.get("targetDate") ?? ""),
                goalId: goal?.id ?? null,
              });
            }}
          >
            {t("askAven")}
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="text-small text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
      </form>
      {draft && (
        <SmartGoalAssistant
          draft={draft}
          goalId={goal?.id}
          references={references}
          onClose={() => setDraft(undefined)}
          onSaved={(id) => {
            onClose();
            router.push("/goals/" + id);
            router.refresh();
          }}
        />
      )}
    </Modal>
  );
}
