"use client";

import { useTranslations } from "next-intl";
import type { Resource } from "@/types";
import ResourceActions from "./ResourceActions";
import ResourcePreview from "./ResourcePreview";
import { resourceHref, type LibraryView } from "./resourcePresentation";

interface Props {
  resource: Resource;
  subject?: string;
  topic?: string;
  view: LibraryView;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ResourceCard({ resource, subject, topic, view, busy, onOpen, onEdit, onDelete }: Props) {
  const t = useTranslations("studyflow");
  const href = resourceHref(resource);
  const grid = view === "grid";
  const preview = <ResourcePreview resource={resource} view={view} />;
  return <article className={`min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:border-brand-300 dark:border-gray-700 dark:bg-gray-dark dark:hover:border-brand-700 ${grid ? "flex flex-col gap-4" : "flex flex-wrap items-center gap-4"}`}>
    {href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={t("library.actionLabel", { action: t("open"), title: resource.title })} className={grid ? "block" : "shrink-0"}>{preview}</a> : preview}
    <div className={`min-w-0 ${grid ? "flex-1" : "flex-1 basis-32"}`}>
      <span className="text-overline text-muted dark:text-muted">{t(resource.type)}</span>
      <h2 title={resource.title} className="mt-1 line-clamp-2 break-words text-h3 text-primary dark:text-primary">{resource.title}</h2>
      <p className="mt-2 truncate text-small text-secondary dark:text-secondary" title={[subject, topic].filter(Boolean).join(" · ")}>{[subject, topic].filter(Boolean).join(" · ")}</p>
      {resource.type === "file" && resource.sizeBytes !== undefined && <p className="mt-1 text-caption text-muted dark:text-muted">{t("library.fileSize", { size: (resource.sizeBytes / 1024 / 1024).toFixed(1) })}</p>}
    </div>
    <div className={grid ? "border-t border-gray-100 pt-3 dark:border-gray-800" : "ms-auto"}><ResourceActions resource={resource} busy={busy} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} /></div>
  </article>;
}
