"use client";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/button/Button";
interface Props { page: number; pages: number; onChange: (page: number) => void }
export default function Pagination({ page, pages, onChange }: Props) {
  const t = useTranslations("studyflow");
  return <div className="my-5 flex items-center justify-between gap-3 text-body text-secondary dark:text-secondary"><span>{t("redesign.pageOf", { page, total: pages })}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t("redesign.previous")}</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>{t("redesign.next")}</Button></div></div>;
}
