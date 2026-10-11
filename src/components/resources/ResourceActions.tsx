"use client";

import { useTranslations } from "next-intl";
import { EditIcon, ExternalLinkIcon, TrashIcon } from "@/icons";
import type { Resource } from "@/types";
import { resourceHref } from "./resourcePresentation";

interface Props {
  resource: Resource;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ResourceActions({ resource, busy, onOpen, onEdit, onDelete }: Props) {
  const t = useTranslations("studyflow");
  const href = resourceHref(resource);
  const actionClass = "inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-secondary transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-secondary dark:hover:border-brand-700 dark:hover:bg-brand-950/50 dark:hover:text-brand-300";
  const label = (action: string) => t("library.actionLabel", { action, title: resource.title });

  return <div className="flex shrink-0 items-center gap-2" aria-busy={busy}>
    {href ? <a href={href} target="_blank" rel="noopener noreferrer" title={t("open")} aria-label={label(t("open"))} className={actionClass}><ExternalLinkIcon aria-hidden="true" className="size-4" /></a>
      : <button type="button" title={t("open")} aria-label={label(t("open"))} disabled={busy} onClick={onOpen} className={actionClass}><ExternalLinkIcon aria-hidden="true" className="size-4" /></button>}
    <button type="button" title={t("edit")} aria-label={label(t("edit"))} disabled={busy} onClick={onEdit} className={actionClass}><EditIcon aria-hidden="true" className="size-4" /></button>
    <button type="button" title={t("delete")} aria-label={label(t("delete"))} disabled={busy} onClick={onDelete} className={`${actionClass} hover:!border-error-300 hover:!bg-error-50 hover:!text-error-600 dark:hover:!border-error-700 dark:hover:!bg-error-950/50 dark:hover:!text-error-400`}><TrashIcon aria-hidden="true" className="size-4" /></button>
  </div>;
}
