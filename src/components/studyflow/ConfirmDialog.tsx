"use client";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { useTranslations } from "next-intl";
interface Props { isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; description: string }
/** Confirmation for destructive mock actions. */
export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, description }: Props) { const t = useTranslations("studyflow"); return <Modal isOpen={isOpen} onClose={onClose} title={title}><p className="mb-6 text-sm text-gray-600 dark:text-gray-300">{description}</p><div className="flex flex-wrap justify-end gap-3"><Button variant="outline" onClick={onClose}>{t("cancel")}</Button><Button onClick={() => { onConfirm(); onClose(); }}>{t("confirm")}</Button></div></Modal>; }
