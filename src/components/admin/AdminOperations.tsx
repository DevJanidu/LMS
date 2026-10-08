"use client";
import TextLink from "@/components/studyflow/TextLink";

import { useTranslations } from "next-intl";
import type { Workspace } from "@/types";
/** Only metadata is available; infrastructure health is deliberately not inferred. */
export default function AdminOperations({data}:{data:Workspace}) {
  const t = useTranslations("studyflow");
  const files = data.resources.filter(r=>r.type==="file");
  const mb = (data.platform?.totalStorageBytes ?? files.reduce((sum,r)=>sum+(r.sizeBytes??0),0))/1024/1024;
  return <section className="sf-panel p-6"><p className="sf-eyebrow">{t("redesign.operations")}</p><div className="my-5 flex items-baseline justify-between gap-3"><span className="text-body text-muted">{t("totalStorage")}</span><strong className="text-h2">{mb.toFixed(1)} MB</strong></div><div className="mb-5 flex items-baseline justify-between gap-3"><span className="text-body text-muted">{t("redesign.uploads")}</span><strong className="text-h2">{data.platform?.fileCount ?? files.length}</strong></div><p className="sf-admin-notice">{t("redesign.dataNotice")}</p><TextLink href="/admin/storage" className="mt-5 block ">{t("storage")}</TextLink></section>;
}
