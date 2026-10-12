"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import Button from "@/components/ui/button/Button";
import RepeatWeekdays from "@/components/calendar/RepeatWeekdays";
import type { GoalDetail, GoalTask } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import { priorities, taskSchema, type TaskInput } from "@/lib/goals/validation";
import GoalLinksField from "./GoalLinksField";
interface Props {
  task?: GoalTask;
  detail: GoalDetail;
  references: GoalReferences;
  onClose: () => void;
  onSave: (id: string, value: TaskInput) => Promise<void>;
}
export default function TaskEditor({
  task,
  detail,
  references,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("goals"),
    [id] = useState(() => task?.id ?? crypto.randomUUID());
  const [subject, setSubject] = useState(task?.subjectId ?? ""),
    [topic, setTopic] = useState(task?.topicId ?? ""),
    [days, setDays] = useState(task?.recurringDays ?? []),
    [dependencies, setDependencies] = useState(task?.dependencyIds ?? []),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t(task ? "editTask" : "addTask")}
      size="wide"
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const fields = new FormData(event.currentTarget);
          const parsed = taskSchema.safeParse({
            title: fields.get("title"),
            description: fields.get("description"),
            milestoneId: fields.get("milestoneId") || null,
            status: fields.get("status"),
            priority: fields.get("priority"),
            dueDate: fields.get("dueDate") || null,
            estimatedMinutes: Number(fields.get("estimatedMinutes")),
            weight: Number(fields.get("weight")),
            subjectId: subject || null,
            topicId: topic || null,
            recurringDays: days,
            evidence: fields.get("evidence"),
            progressMode: fields.get("progressMode"),
            manualProgress: Number(fields.get("manualProgress")),
            dependencyIds: dependencies,
          });
          if (!parsed.success) {
            setError(t("errors.invalidInput"));
            return;
          }
          setBusy(true);
          try {
            await onSave(id, parsed.data);
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
          defaultValue={task?.title}
        />
        <details className="goal-editor-advanced">
          <summary>{t("workspace.advancedDetails")}</summary>
          <div className="space-y-4">
            <TextField
              label={t("fields.description")}
              name="description"
              defaultValue={task?.description}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t("milestone")}
                name="milestoneId"
                defaultValue={task?.milestoneId ?? ""}
              >
                <option value="">{t("none")}</option>
                {detail.milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t("fields.status")}
                name="status"
                defaultValue={task?.status ?? "todo"}
              >
                {["todo", "inProgress", "completed", "cancelled"].map((key) => (
                  <option key={key} value={key}>
                    {t(`taskStatuses.${key}`)}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t("fields.priority")}
                name="priority"
                defaultValue={task?.priority ?? "normal"}
              >
                {priorities.map((key) => (
                  <option key={key} value={key}>
                    {t(`priorities.${key}`)}
                  </option>
                ))}
              </SelectField>
              <Field
                label={t("fields.dueDate")}
                name="dueDate"
                type="date"
                defaultValue={task?.dueDate ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("fields.estimatedMinutes")}
                name="estimatedMinutes"
                type="number"
                min={0}
                defaultValue={task?.estimatedMinutes ?? 30}
              />
              <Field
                label={t("fields.weight")}
                name="weight"
                type="number"
                min={1}
                max={1000}
                defaultValue={task?.weight ?? 1}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label={t("fields.subjects")}
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setTopic("");
                }}
              >
                <option value="">{t("none")}</option>
                {references.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label={t("fields.topics")}
                value={topic}
                disabled={!subject}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="">{t("none")}</option>
                {references.topics
                  .filter((t) => t.subjectId === subject)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </SelectField>
            </div>
            <GoalLinksField
              label={t("fields.dependencies")}
              options={detail.tasks.filter((t) => t.id !== task?.id)}
              value={dependencies}
              onChange={setDependencies}
            />
            <RepeatWeekdays weekdays={days} onChange={setDays} />
            <p className="text-secondary dark:text-secondary text-small">
              {t("habitHelp")}
            </p>
            <SelectField
              label={t("fields.taskProgressMode")}
              name="progressMode"
              defaultValue={task?.progressMode ?? "manual"}
            >
              <option value="manual">{t("manualProgress")}</option>
              <option value="derived">{t("derivedProgress")}</option>
            </SelectField>
            <Field
              label={t("fields.manualProgress")}
              name="manualProgress"
              type="number"
              min={0}
              max={100}
              defaultValue={task?.manualProgress ?? 0}
            />
            <TextField
              label={t("fields.evidence")}
              name="evidence"
              defaultValue={task?.evidence}
            />
          </div>
        </details>
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
