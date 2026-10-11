"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import Button from "@/components/ui/button/Button";
import { useRouter } from "@/i18n/navigation";
import SmartGoalAssistant from "@/components/aven/SmartGoalAssistant";
import {
  categories,
  goalSchema,
  goalStatuses,
  priorities,
  progressModes,
  type GoalInput,
} from "@/lib/goals/validation";
import type { GoalRecord } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import GoalLinksField from "./GoalLinksField";
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
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(goal?.category ?? "academic"),
    [mode, setMode] = useState(goal?.progressMode ?? "tasks");
  const [subjectIds, setSubjectIds] = useState(goal?.subjectIds ?? []),
    [topicIds, setTopicIds] = useState(goal?.topicIds ?? []),
    [resourceIds, setResourceIds] = useState(goal?.resourceIds ?? []);
  const form = useRef<HTMLFormElement>(null),
    router = useRouter(),
    [smartDraft, setSmartDraft] = useState<Record<string, unknown>>();
  const today = localDay(Date.now(), references.timezone),
    target = shiftDay(today, 30);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(goal ? "editGoal" : "createGoal")}
      size="wide"
    >
      <form
        ref={form}
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const fields = new FormData(event.currentTarget);
          const number = (key: string, fallback = 0) =>
            Number(fields.get(key) ?? fallback);
          const value = goalSchema.safeParse({
            title: fields.get("title"),
            description: fields.get("description"),
            category,
            customCategory: fields.get("customCategory") ?? "",
            startDate: fields.get("startDate"),
            targetDate: fields.get("targetDate"),
            priority: fields.get("priority"),
            status: fields.get("status"),
            motivation: fields.get("motivation"),
            successCriteria: fields.get("successCriteria"),
            estimatedMinutes: number("estimatedMinutes"),
            progressMode: mode,
            progressConfig: {
              hoursTarget: number(
                "hoursTarget",
                goal?.progressConfig.hoursTarget ?? 100,
              ),
              quantityTarget: number(
                "quantityTarget",
                goal?.progressConfig.quantityTarget ?? 20,
              ),
              taskWeight: number(
                "taskWeight",
                goal?.progressConfig.taskWeight ?? 1,
              ),
              timeWeight: number(
                "timeWeight",
                goal?.progressConfig.timeWeight ?? 0,
              ),
              quantityWeight: number(
                "quantityWeight",
                goal?.progressConfig.quantityWeight ?? 0,
              ),
              outcomeWeight: number(
                "outcomeWeight",
                goal?.progressConfig.outcomeWeight ?? 0,
              ),
            },
            subjectIds,
            topicIds,
            resourceIds,
            reminders: fields.get("reminders") === "on",
          });
          if (!value.success) {
            setError(t("errors.invalidInput"));
            return;
          }
          setBusy(true);
          setError("");
          try {
            await onSave(value.data);
          } catch (error) {
            const key =
              error instanceof Error ? error.message : "serviceUnavailable";
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
          maxLength={200}
          defaultValue={goal?.title}
        />
        <TextField
          label={t("fields.description")}
          name="description"
          defaultValue={goal?.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={t("fields.category")}
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
          >
            {categories.map((key) => (
              <option key={key} value={key}>
                {t(`categories.${key}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t("fields.priority")}
            name="priority"
            defaultValue={goal?.priority ?? "normal"}
          >
            {priorities.map((key) => (
              <option key={key} value={key}>
                {t(`priorities.${key}`)}
              </option>
            ))}
          </SelectField>
        </div>
        {category === "custom" && (
          <Field
            label={t("fields.customCategory")}
            name="customCategory"
            defaultValue={goal?.customCategory}
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("fields.startDate")}
            name="startDate"
            type="date"
            required
            defaultValue={goal?.startDate ?? today}
          />
          <Field
            label={t("fields.targetDate")}
            name="targetDate"
            type="date"
            required
            defaultValue={goal?.targetDate ?? target}
          />
        </div>
        <TextField
          label={t("fields.motivation")}
          name="motivation"
          defaultValue={goal?.motivation}
        />
        <TextField
          label={t("fields.successCriteria")}
          name="successCriteria"
          defaultValue={goal?.successCriteria}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("fields.estimatedMinutes")}
            name="estimatedMinutes"
            type="number"
            min={0}
            defaultValue={goal?.estimatedMinutes ?? 0}
          />
          <SelectField
            label={t("fields.status")}
            name="status"
            defaultValue={goal?.status ?? "active"}
          >
            {goalStatuses.map((key) => (
              <option key={key} value={key}>
                {t(`statuses.${key}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <SelectField
          label={t("fields.progressMode")}
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          {progressModes.map((key) => (
            <option key={key} value={key}>
              {t(`modes.${key}`)}
            </option>
          ))}
        </SelectField>
        {(mode === "time" || mode === "hybrid") && (
          <Field
            label={t("fields.hoursTarget")}
            name="hoursTarget"
            type="number"
            min={1}
            defaultValue={goal?.progressConfig.hoursTarget ?? 100}
          />
        )}
        {(mode === "quantity" || mode === "hybrid") && (
          <Field
            label={t("fields.quantityTarget")}
            name="quantityTarget"
            type="number"
            min={1}
            defaultValue={goal?.progressConfig.quantityTarget ?? 20}
          />
        )}
        {mode === "hybrid" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                "taskWeight",
                "timeWeight",
                "quantityWeight",
                "outcomeWeight",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                label={t(`fields.${key}`)}
                name={key}
                type="number"
                min={0}
                max={100}
                defaultValue={
                  goal?.progressConfig[key] ?? (key === "taskWeight" ? 1 : 0)
                }
              />
            ))}
          </div>
        )}
        {mode === "outcome" && (
          <p className="text-secondary dark:text-secondary text-small">
            {t("outcomeHelp")}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <GoalLinksField
            label={t("fields.subjects")}
            options={references.subjects}
            value={subjectIds}
            onChange={setSubjectIds}
          />
          <GoalLinksField
            label={t("fields.topics")}
            options={references.topics}
            value={topicIds}
            onChange={setTopicIds}
          />
        </div>
        <GoalLinksField
          label={t("fields.resources")}
          options={references.resources}
          value={resourceIds}
          onChange={setResourceIds}
        />
        <label className="text-primary dark:text-primary flex items-center gap-2 text-small">
          <input
            type="checkbox"
            name="reminders"
            defaultChecked={goal?.reminders ?? true}
          />
          {t("fields.reminders")}
        </label>
        <div className="space-y-2">
          <p className="text-secondary dark:text-secondary text-small">
            {t("smartHelp")}
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (!form.current) return;
              const fields = new FormData(form.current);
              const draft = Object.fromEntries(
                [
                  "title",
                  "description",
                  "motivation",
                  "successCriteria",
                  "startDate",
                  "targetDate",
                  "priority",
                  "estimatedMinutes",
                ].map((key) => [
                  key,
                  String(fields.get(key) ?? "").slice(
                    0,
                    key === "description" ? 1500 : 500,
                  ),
                ]),
              );
              setSmartDraft({
                ...draft,
                goalId: goal?.id ?? null,
                expectedVersion: goal?.version ?? 0,
                category,
                progressMode: mode,
                subjectIds,
                topicIds,
                resourceIds,
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
        <Button type="submit" disabled={busy}>
          {t(busy ? "saving" : "save")}
        </Button>
      </form>
      {smartDraft && (
        <SmartGoalAssistant
          draft={smartDraft}
          goalId={goal?.id}
          references={references}
          onClose={() => setSmartDraft(undefined)}
          onSaved={(id) => {
            onClose();
            router.push(`/goals/${id}`);
            router.refresh();
          }}
        />
      )}
    </Modal>
  );
}
