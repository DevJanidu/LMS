"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useWorkspace } from "@/lib/mock/store";
import { getSessions } from "@/lib/mock";
import { totalSeconds } from "@/lib/analytics";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import UserStatusAction from "./UserStatusAction";
interface Props { initial: Workspace }
/** Search and sort learner accounts without accessing private study content. */
export default function AdminUsers({ initial }: Props) {
  const data = useWorkspace(initial); const t = useTranslations("studyflow"); const locale = useLocale(); const [query, setQuery] = useState(""); const [sort, setSort] = useState("name"); const [direction, setDirection] = useState("asc");
  const users = data.users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => { const diff = sort === "studyTime" ? totalSeconds(getSessions(data, a.id)) - totalSeconds(getSessions(data, b.id)) : String(a[sort as "name" | "email" | "createdAt" | "lastActiveAt" | "status"]).localeCompare(String(b[sort as "name" | "email" | "createdAt" | "lastActiveAt" | "status"])); return direction === "asc" ? diff : -diff; });
  const cell = "px-4 py-4 text-start text-sm whitespace-nowrap";
  return <><PageHeader title={t("users")} description={t("usersDescription")}/><div className="mb-6 grid gap-4 sm:grid-cols-3"><Field label={t("searchUsers")} value={query} onChange={(event) => setQuery(event.target.value)}/><SelectField label={t("sortBy")} value={sort} onChange={(event) => setSort(event.target.value)}>{[["name", "name"], ["email", "email"], ["createdAt", "joined"], ["lastActiveAt", "lastActive"], ["studyTime", "studyTime"], ["status", "status"]].map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</SelectField><SelectField label={t("sortOrder")} value={direction} onChange={(event) => setDirection(event.target.value)}><option value="asc">{t("ascending")}</option><option value="desc">{t("descending")}</option></SelectField></div>{users.length ? <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/3"><Table><TableHeader className="bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400"><TableRow>{["name", "email", "joined", "lastActive", "studyTime", "status", "actions"].map((key) => <TableCell key={key} isHeader className={cell}>{t(key)}</TableCell>)}</TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id} className="border-t border-gray-100 dark:border-gray-800"><TableCell className={cell}><Link href={`/admin/users/${user.id}`} className="text-brand-600 dark:text-brand-300">{user.name}</Link></TableCell><TableCell className={cell}>{user.email}</TableCell><TableCell className={cell}>{formatDate(user.createdAt, data.user.timezone, locale)}</TableCell><TableCell className={cell}>{formatDate(user.lastActiveAt, data.user.timezone, locale)}</TableCell><TableCell className={cell}>{duration(totalSeconds(getSessions(data, user.id)))}</TableCell><TableCell className={cell}>{t(user.status)}</TableCell><TableCell className={cell}><UserStatusAction data={data} user={user}/></TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title={t("noUsers")}/>}</>;
}
