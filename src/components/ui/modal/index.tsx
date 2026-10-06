"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/icons";
import { useTranslations } from "next-intl";
interface ModalProps { isOpen: boolean; onClose: () => void; children: ReactNode; className?: string; title?: string; showCloseButton?: boolean; isFullscreen?: boolean }
/** Native dialog traps focus and restores it on close. */
export function Modal({ isOpen, onClose, children, className = "", title, showCloseButton = true }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId(); const t = useTranslations("studyflow");
  useEffect(() => { const dialog = ref.current; if (isOpen && !dialog?.open) dialog?.showModal(); if (!isOpen && dialog?.open) dialog.close(); }, [isOpen]);
  return <dialog ref={ref} aria-labelledby={id} onCancel={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }} className={`fixed inset-0 m-auto max-h-dvh w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-gray-800 shadow-theme-xl backdrop:bg-gray-950/60 sm:p-8 dark:border-gray-700 dark:bg-gray-900 dark:text-white ${className}`}><h2 id={id} className={title ? "mb-6 pe-8 text-xl font-semibold" : "sr-only"}>{title ?? t("dialog")}</h2>{showCloseButton && <button type="button" aria-label={t("close")} onClick={onClose} className="absolute end-4 top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"><CloseIcon className="size-5"/></button>}{children}</dialog>;
}
