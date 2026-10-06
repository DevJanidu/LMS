"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Workspace } from "@/types";
/** Only metadata is available; infrastructure health is deliberately not inferred. */
export default function AdminOperations({data}:{data:Workspace}) {
  const t = useTranslations("studyflow");
  const files = data.resources.filter(r=>r.type==="file");
  const mb = files.reduce((sum,r)=>sum+(r.sizeBytes??0),0)/1024/1024;
  return <section className="sf-panel p-6"><p className="sf-eyebrow">{t("redesign.operations")}</p><div className="my-5 flex items-baseline justify-between gap-3"><span className="text-sm text-muted">{t("totalStorage")}</span><strong className="text-xl font-medium">{mb.toFixed(1)} MB</strong></div><div className="mb-5 flex items-baseline justify-between gap-3"><span className="text-sm text-muted">{t("redesign.uploads")}</span><strong className="text-xl font-medium">{files.length}</strong></div><p className="sf-admin-notice">{t("redesign.dataNotice")}</p><Link href="/admin/storage" className="mt-5 block text-sm text-brand-600 dark:text-brand-300">{t("storage")} →</Link></section>;
}
