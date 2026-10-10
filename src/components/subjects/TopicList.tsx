"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { getTopics } from "@/lib/workspace/queries";
import { newId, updateWorkspace, runOperation } from "@/lib/workspace/store";
import type { Topic, Workspace } from "@/types";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import Button from "@/components/ui/button/Button";
import Field, {
  SelectField,
  TextField,
} from "@/components/studyflow/FormFields";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { Checkbox } from "@/components/ui/Checkbox";
interface Props {
  data: Workspace;
  subjectId: string;
}
/** Completion, bulk entry, editable topics and accessible reordering. */
export default function TopicList({ data, subjectId }: Props) {
  const t = useTranslations("studyflow");
  const topics = getTopics(data, subjectId);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [dragged, setDragged] = useState<string>();
  const [editing, setEditing] = useState<Topic>();
  const [deleting, setDeleting] = useState<Topic>();
  const bulk = useModal();
  const editor = useModal();
  const change = (id: string, patch: Partial<Topic>, original?: Topic) =>
    updateWorkspace(data, (state) => ({
      ...state,
      topics: state.topics.map((topic) =>
        topic.id === id
          ? { ...topic, ...patch, updatedAt: new Date().toISOString() }
          : topic,
      ),
    }), original);
  const add = async (text: string): Promise<boolean> => {
    const titles = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!titles.length) return false;
    if (topics.length + titles.length > 200) {
      setError(t("topicLimit"));
      return false;
    }
    const request = updateWorkspace(data, (state) => {
      const now = new Date().toISOString();
      return {
        ...state,
        topics: [
          ...state.topics,
          ...titles.map((name, index): Topic => ({
            id: newId(),
            subjectId,
            title: name.slice(0, 150),
            status: "notStarted",
            sortOrder: topics.length + index,
            createdAt: now,
            updatedAt: now,
          })),
        ],
      };
    });
    bulk.closeModal();
    setTitle(""); setError("");
    const saved = await request;
    if (!saved) { setError(t("saveFailed")); return false; }
    return true;
  };
  const reorder = (from: string, to: string) => {
    const order = topics.map((topic) => topic.id);
    const index = order.indexOf(from);
    const destination = order.indexOf(to);
    if (index < 0 || destination < 0) return;
    order.splice(index, 1);
    order.splice(destination, 0, from);
    updateWorkspace(data, (state) => ({
      ...state,
      topics: state.topics.map((topic) =>
        topic.subjectId === subjectId && !topic.archived
          ? { ...topic, sortOrder: order.indexOf(topic.id) }
          : topic,
      ),
    }));
  };
  return (
    <div className="sf-topic-list space-y-5">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          add(title);
        }}
      >
        <div className="min-w-0 flex-1">
          <Field
            label={t("newTopic")}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={150}
          />
        </div>
        <Button type="submit">{t("addTopic")}</Button>
        <Button variant="outline" onClick={bulk.openModal}>
          {t("bulkAdd")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-body text-error-600 dark:text-error-400">
          {error}
        </p>
      )}
      {!topics.length && (
        <EmptyState title={t("noTopics")} description={t("noTopicsHelp")} />
      )}
      <ul className="sf-roadmap space-y-3">
        {topics.map((topic, index) => (
          <li
            key={topic.id}
            draggable
            onDragStart={() => setDragged(topic.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragged) reorder(dragged, topic.id);
              setDragged(undefined);
            }}
            className={`sf-roadmap-step ${topic.status === "completed" ? "is-complete" : topics.find(item => item.status !== "completed")?.id === topic.id ? "is-current" : ""} flex flex-wrap items-center gap-3 p-4`}
          >
            <span
              aria-hidden="true"
              className="cursor-grab text-muted dark:text-muted"
            >
              ⠿
            </span>
            <label className="flex min-w-0 flex-1 items-center gap-3">
              <Checkbox
                checked={topic.status === "completed"}
                className="size-4"
                aria-label={`${t("completed")}: ${topic.title}`}
                onCheckedChange={(checked) =>
                  change(topic.id, {
                    status: checked === true ? "completed" : "notStarted",
                    completedAt: checked === true
                      ? new Date().toISOString()
                      : undefined,
                  })
                }
              />
              <span
                className={
                  topic.status === "completed"
                    ? "text-body text-muted line-through dark:text-muted"
                    : "text-body"
                }
              >
                {topic.title}
              </span>
            </label>
            <span className="text-small text-muted dark:text-secondary">
              {t(topic.status)}
              {topic.targetDate && ` · ${topic.targetDate}`}
            </span>
            <div className="flex gap-2">
              <button
                disabled={index === 0}
                aria-label={t("moveUp", { title: topic.title })}
                onClick={() => reorder(topic.id, topics[index - 1].id)}
                className="rounded p-1 text-muted disabled:opacity-30 dark:text-secondary"
              >
                ↑
              </button>
              <button
                disabled={index === topics.length - 1}
                aria-label={t("moveDown", { title: topic.title })}
                onClick={() => reorder(topic.id, topics[index + 1].id)}
                className="rounded p-1 text-muted disabled:opacity-30 dark:text-secondary"
              >
                ↓
              </button>
              <button
                onClick={() => {
                  setEditing(topic);
                  editor.openModal();
                }}
                className="text-small text-brand-600 dark:text-brand-300"
              >
                {t("edit")}
              </button>
              <button
                onClick={() => setDeleting(topic)}
                className="text-small text-error-600 dark:text-error-400"
              >
                {t("delete")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Modal
        isOpen={bulk.isOpen}
        onClose={bulk.closeModal}
        title={t("bulkAdd")}
      >
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await add(String(new FormData(event.currentTarget).get("titles"))))
              bulk.closeModal();
          }}
        >
          <TextField label={t("onePerLine")} name="titles" required />
          <Button type="submit">{t("addTopics")}</Button>
          {error && <p role="alert">{error}</p>}
        </form>
      </Modal>
      <Modal
        isOpen={editor.isOpen}
        onClose={editor.closeModal}
        title={t("editTopic")}
      >
        <form
          key={editing?.id}
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!editing) return;
            const fields = new FormData(event.currentTarget);
            const status = fields.get("status") as Topic["status"];
            const request = change(editing.id, {
              title: String(fields.get("title")).trim(),
              status,
              targetDate: String(fields.get("date")) || undefined,
              completedAt:
                status === "completed"
                  ? (editing.completedAt ?? new Date().toISOString())
                  : undefined,
            }, editing);
            editor.closeModal();
            if (!await request) setError(t("saveFailed"));
          }}
        >
          <Field
            label={t("title")}
            name="title"
            required
            defaultValue={editing?.title}
          />
          <SelectField
            label={t("status")}
            name="status"
            defaultValue={editing?.status}
          >
            {["notStarted", "inProgress", "completed"].map((status) => (
              <option key={status} value={status}>
                {t(status)}
              </option>
            ))}
          </SelectField>
          <Field
            label={t("targetOptional")}
            type="date"
            name="date"
            defaultValue={editing?.targetDate}
          />
          <Button type="submit">{t("save")}</Button>
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("deleteTopic")}
        description={t("deleteTopicWarning")}
        onConfirm={async () => {
          if (!deleting) return false;
          const result = await runOperation(data, { kind: "delete", entity: "topic", id: deleting.id });
          return result.ok;
        }}
      />
    </div>
  );
}
