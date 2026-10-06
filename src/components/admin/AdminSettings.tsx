"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { newId, updateWorkspace, useWorkspace } from "@/lib/mock/store";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import Field from "@/components/studyflow/FormFields";
import ComponentCard from "@/components/common/ComponentCard";
import EmptyState from "@/components/studyflow/EmptyState";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
interface Props { initial: Workspace }
/** Adjustable mock platform limits and admin action history. */
export default function AdminSettings({ initial }: Props) {
  const data = useWorkspace(initial); const t = useTranslations("studyflow"); const locale = useLocale(); const [message, setMessage] = useState(""); const cell = "px-4 py-4 text-start text-sm whitespace-nowrap";
  return <><PageHeader title={t("adminSettings")} description={t("adminSettingsDescription")}/><div className="space-y-6"><ComponentCard title={t("platformLimits")}><form className="max-w-xl space-y-4" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); updateWorkspace(initial, (state) => ({ ...state, settings: { streakMinutes: Number(fields.get("streak")), maxFileSizeMB: Number(fields.get("file")), storagePerUserMB: Number(fields.get("storage")) }, auditLogs: [{ id: newId(), actorUserId: "admin-1", action: "settingsChanged", targetType: "settings", targetId: "platform", createdAt: new Date().toISOString() }, ...state.auditLogs] })); setMessage(t("settingsSaved")); }}><Field label={t("streakMinutes")} type="number" min={1} max={1440} required name="streak" defaultValue={data.settings.streakMinutes}/><Field label={t("maxFileSize")} type="number" min={1} max={100} required name="file" defaultValue={data.settings.maxFileSizeMB}/><Field label={t("storagePerUser")} type="number" min={1} max={10000} required name="storage" defaultValue={data.settings.storagePerUserMB}/><Button type="submit">{t("save")}</Button>{message && <p role="status" className="text-sm text-success-700 dark:text-success-300">{message}</p>}</form></ComponentCard><ComponentCard title={t("auditLog")}>{data.auditLogs.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow>{["admin", "action", "target", "time"].map((key) => <TableCell key={key} isHeader className={cell}>{t(key)}</TableCell>)}</TableRow></TableHeader><TableBody>{data.auditLogs.map((entry) => <TableRow key={entry.id} className="border-t border-gray-100 dark:border-gray-800"><TableCell className={cell}>{t("admin")}</TableCell><TableCell className={cell}>{t(entry.action)}</TableCell><TableCell className={cell}>{data.users.find((user) => user.id === entry.targetId)?.name ?? t("platform")}</TableCell><TableCell className={cell}>{formatDate(entry.createdAt, data.user.timezone, locale, true)}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title={t("noAudit")}/>}</ComponentCard></div></>;
}
