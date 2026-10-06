"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import { newId, updateWorkspace } from "@/lib/workspace/store";
import type { Subject, SubjectColor, Workspace } from "@/types";
import { getSubjects } from "@/lib/workspace/queries";
interface Props {
  initial: Workspace;
  subject?: Subject;
  isOpen: boolean;
  onClose: () => void;
}
/** Title-first subject form with optional study details. */
export default function SubjectModal({
  initial,
  subject,
  isOpen,
  onClose,
}: Props) {
  const t = useTranslations("studyflow");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(subject ? "editSubject" : "addSubject")}
    >
      <form
        key={subject?.id ?? "new"}
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const title = String(fields.get("title")).trim();
          if (!title) {
            setError(t("titleRequired"));
            return;
          }
          let accepted = false;
          setPending(true);
          const saved = await updateWorkspace(initial, (data) => {
            if (
              !subject &&
              getSubjects(data).filter((item) => item.status === "active")
                .length >= 50
            )
              return data;
            const now = new Date().toISOString();
            const value: Subject = {
              id: subject?.id ?? newId(),
              userId: data.user.id,
              title,
              description: String(fields.get("description")),
              color: fields.get("color") as SubjectColor,
              targetDate: String(fields.get("targetDate")) || undefined,
              status: subject?.status ?? "active",
              createdAt: subject?.createdAt ?? now,
              updatedAt: now,
            };
            accepted = true;
            return {
              ...data,
              subjects: subject
                ? data.subjects.map((item) =>
                    item.id === subject.id ? value : item,
                  )
                : [...data.subjects, value],
            };
          });
          setPending(false);
          if (!accepted) setError(t("subjectLimit"));
          else if (saved) onClose();
          else setError(t("saveFailed"));
        }}
      >
        <Field
          label={t("title")}
          name="title"
          required
          maxLength={150}
          defaultValue={subject?.title}
        />
        <TextField
          label={t("descriptionOptional")}
          name="description"
          defaultValue={subject?.description}
        />
        <SelectField
          label={t("color")}
          name="color"
          defaultValue={subject?.color ?? "brand"}
        >
          {["brand", "success", "orange", "purple"].map((color) => (
            <option key={color} value={color}>
              {t(`colors.${color}`)}
            </option>
          ))}
        </SelectField>
        <Field
          label={t("targetOptional")}
          name="targetDate"
          type="date"
          defaultValue={subject?.targetDate}
        />
        {error && (
          <p
            role="alert"
            className="text-sm text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>{t("save")}</Button>
      </form>
    </Modal>
  );
}
