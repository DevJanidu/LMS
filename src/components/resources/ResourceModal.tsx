"use client";
import { useRef, useState } from "react";
import { createUpload, finishUpload } from "@/app/[locale]/file-actions";
import { useTranslations } from "next-intl";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import { getResources } from "@/lib/workspace/queries";
import { newId, runOperation, reloadWorkspace } from "@/lib/workspace/store";
import type { Resource, Workspace } from "@/types";
import StudySelectors from "@/components/study/StudySelectors";
interface Props {
  data: Workspace;
  resource?: Resource;
  subjectId?: string;
  isOpen: boolean;
  onClose: () => void;
}
/** Resource metadata form; files upload directly into private storage. */
export default function ResourceModal({
  data,
  resource,
  subjectId = "",
  isOpen,
  onClose,
}: Props) {
  const t = useTranslations("studyflow");
  const [type, setType] = useState<Resource["type"]>(resource?.type ?? "link");
  const [subject, setSubject] = useState(resource?.subjectId ?? subjectId);
  const [topic, setTopic] = useState(resource?.topicId ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t(resource ? "editResource" : "addResource")}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          submitting.current = true; setPending(true);
          try {
          const fields = new FormData(event.currentTarget);
          const title = String(fields.get("title")).trim();
          const url = String(fields.get("url") ?? "").trim();
          const selected = fields.get("file");
          const file =
            selected instanceof File && selected.size ? selected : undefined;
          if (!title) {
            setError(t("titleRequired"));
            return;
          }
          if (type === "link" || type === "video") {
            try {
              const parsed = new URL(url);
              if (!["https:", "http:"].includes(parsed.protocol))
                throw new Error();
            } catch {
              setError(t("invalidUrl"));
              return;
            }
          }
          if (type === "file") {
            if (!file && !resource?.sizeBytes) {
              setError(t("chooseFile"));
              return;
            }
            if (
              file &&
              !/\.(pdf|png|jpe?g|docx|pptx|xlsx|txt)$/i.test(file.name)
            ) {
              setError(t("invalidFileType"));
              return;
            }
            const size = file?.size ?? resource?.sizeBytes ?? 0;
            if (size > data.settings.maxFileSizeMB * 1024 * 1024) {
              setError(
                t("fileTooLarge", { limit: data.settings.maxFileSizeMB }),
              );
              return;
            }
            const used = getResources(data)
              .filter((item) => item.id !== resource?.id)
              .reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
            if (used + size > data.settings.storagePerUserMB * 1024 * 1024) {
              setError(t("storageLimit"));
              return;
            }
          }
          const value: Resource = {
            id: resource?.id ?? newId(),
            userId: data.user.id,
            subjectId: subject,
            topicId: topic || undefined,
            title,
            type,
            url: type === "link" || type === "video" ? url : undefined,
            textContent:
              type === "note" ? String(fields.get("note")) : undefined,
            sizeBytes:
              type === "file" ? (file?.size ?? resource?.sizeBytes) : undefined,
            mimeType:
              type === "file" ? (file?.type ?? resource?.mimeType) : undefined,
            createdAt: resource?.createdAt ?? new Date().toISOString(),
          };
          if (type === "file" && file) {
            try {
              const upload = await createUpload({ subjectId: subject, topicId: topic || undefined, title, name: file.name, mimeType: file.type, sizeBytes: file.size });
              if (!upload.ok) { setError(t(upload.error)); return; }
              const sent = await fetch(upload.data.url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
              if (!sent.ok) { setError(t("uploadFailed")); return; }
              const confirmed = await finishUpload(upload.data.id);
              if (!confirmed.ok) { setError(t(confirmed.error)); return; }
              if (resource) {
                const removed = await runOperation(data, { kind: "delete", entity: "resource", id: resource.id });
                if (!removed.ok) { setError(t(removed.error)); return; }
              }
              await reloadWorkspace();
            } catch { setError(t("uploadFailed")); return; }
          } else {
            const saved = await runOperation(data, { kind: "resource", value });
            if (!saved.ok) { setError(t(saved.error)); return; }
          }
          onClose();
          } finally { submitting.current = false; setPending(false); }
        }}
      >
        <Field
          label={t("title")}
          name="title"
          required
          defaultValue={resource?.title}
        />
        <StudySelectors
          data={data}
          subjectId={subject}
          topicId={topic}
          onSubjectChange={setSubject}
          onTopicChange={setTopic}
          includeArchived
        />
        <SelectField
          label={t("type")}
          value={type}
          onChange={(event) => setType(event.target.value as Resource["type"])}
        >
          {["link", "video", "file", "note"].map((key) => (
            <option key={key} value={key}>
              {t(key)}
            </option>
          ))}
        </SelectField>
        {(type === "link" || type === "video") && (
          <Field
            label={t("url")}
            name="url"
            type="url"
            required
            defaultValue={resource?.url}
          />
        )}{" "}
        {type === "note" && (
          <TextField
            label={t("noteText")}
            name="note"
            required
            defaultValue={resource?.textContent}
          />
        )}{" "}
        {type === "file" && (
          <>
            <Field
              label={t("file")}
              name="file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.xlsx,.txt"
            />
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              {t("fileLimit", { limit: data.settings.maxFileSizeMB })}
            </p>
          </>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm text-error-600 dark:text-error-400"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={!subject || pending}>
          {t(pending ? "loading" : "save")}
        </Button>
      </form>
    </Modal>
  );
}
