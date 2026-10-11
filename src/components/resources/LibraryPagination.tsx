"use client";

import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/icons";
import { libraryPages, RESOURCE_PAGE_SIZE } from "./resourcePresentation";

interface Props { page: number; total: number; loading: boolean; onChange: (page: number) => void }

export default function LibraryPagination({ page, total, loading, onChange }: Props) {
  const t = useTranslations("studyflow");
  const pages = Math.max(1, Math.ceil(total / RESOURCE_PAGE_SIZE));
  const numbers = libraryPages(page, pages);
  const buttonClass = "grid size-11 place-items-center rounded-xl border border-gray-200 bg-white text-small text-secondary transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-secondary dark:hover:bg-gray-800";
  return <nav aria-label={t("library.pagination")} className="my-6 flex flex-wrap items-center justify-between gap-4">
    <p aria-live="polite" className="text-small text-secondary dark:text-secondary">{t("library.results", { from: total ? (page - 1) * RESOURCE_PAGE_SIZE + 1 : 0, to: Math.min(page * RESOURCE_PAGE_SIZE, total), total })}</p>
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" aria-label={t("redesign.previous")} title={t("redesign.previous")} disabled={loading || page <= 1} onClick={() => onChange(page - 1)} className={buttonClass}><ArrowRightIcon className="size-4 rotate-180 rtl:rotate-0" /></button>
      {numbers.map((number, index) => <span key={number} className="flex items-center gap-1">
        {index > 0 && number - numbers[index - 1] > 1 && <span aria-hidden="true" className="px-1 text-muted dark:text-muted">…</span>}
        <button type="button" aria-label={t("library.page", { page: number })} aria-current={page === number ? "page" : undefined} disabled={loading} onClick={() => onChange(number)} className={`${buttonClass} aria-[current=page]:border-brand-500 aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700 dark:aria-[current=page]:bg-brand-950/50 dark:aria-[current=page]:text-brand-300`}>{number}</button>
      </span>)}
      <button type="button" aria-label={t("redesign.next")} title={t("redesign.next")} disabled={loading || page >= pages} onClick={() => onChange(page + 1)} className={buttonClass}><ArrowRightIcon className="size-4 rtl:rotate-180" /></button>
    </div>
  </nav>;
}
