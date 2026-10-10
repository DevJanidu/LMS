"use client";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/Checkbox";
import { ChevronDownIcon, EditIcon, TrashIcon } from "@/icons";
import type { Topic } from "@/types";

interface Props {
  topic: Topic;
  current: boolean;
  first: boolean;
  last: boolean;
  onComplete: (completed: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onDrag: () => void;
  onDrop: () => void;
}

/** A single compact row keeps all topic actions accessible without wrapping. */
export default function TopicRow({ topic, current, first, last, onComplete, onEdit, onDelete, onMove, onDrag, onDrop }: Props) {
  const t = useTranslations("studyflow");
  const status = `${t(topic.status)}${topic.targetDate ? ` · ${topic.targetDate}` : ""}`;
  return <li draggable onDragStart={onDrag} onDragOver={event => event.preventDefault()} onDrop={onDrop}
    className={`sf-roadmap-step ${topic.status === "completed" ? "is-complete" : current ? "is-current" : ""}`}>
    <span aria-hidden="true" className="cursor-grab text-muted dark:text-muted">⠿</span>
    <label className="flex min-w-0 items-center gap-2" title={`${topic.title} · ${status}`}>
      <Checkbox checked={topic.status === "completed"} aria-label={`${t("completed")}: ${topic.title}`} onCheckedChange={checked => onComplete(checked === true)} />
      <span className={`truncate text-body ${topic.status === "completed" ? "text-muted line-through dark:text-muted" : "text-primary dark:text-primary"}`}>{topic.title}</span>
    </label>
    <span className="sf-topic-status text-caption text-muted dark:text-secondary" title={status}>{status}</span>
    <div className="sf-topic-actions flex items-center gap-1">
      <button type="button" disabled={first} aria-label={t("moveUp", { title: topic.title })} title={t("moveUp", { title: topic.title })} onClick={() => onMove(-1)} className="rounded text-muted hover:bg-gray-100 disabled:opacity-30 dark:text-secondary dark:hover:bg-gray-800"><ChevronDownIcon className="size-4 rotate-180" /></button>
      <button type="button" disabled={last} aria-label={t("moveDown", { title: topic.title })} title={t("moveDown", { title: topic.title })} onClick={() => onMove(1)} className="rounded text-muted hover:bg-gray-100 disabled:opacity-30 dark:text-secondary dark:hover:bg-gray-800"><ChevronDownIcon className="size-4" /></button>
      <button type="button" aria-label={`${t("editTopic")}: ${topic.title}`} title={t("editTopic")} onClick={onEdit} className="rounded text-brand-600 hover:bg-gray-100 dark:text-brand-300 dark:hover:bg-gray-800"><EditIcon className="size-4" /></button>
      <button type="button" aria-label={`${t("deleteTopic")}: ${topic.title}`} title={t("deleteTopic")} onClick={onDelete} className="rounded text-error-600 hover:bg-gray-100 dark:text-error-400 dark:hover:bg-gray-800"><TrashIcon className="size-4" /></button>
    </div>
  </li>;
}
