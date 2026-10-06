"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNow, useWorkspace } from "@/lib/workspace/store";
import { getSessions } from "@/lib/workspace/queries";
import { totalSeconds } from "@/lib/analytics";
import { csvCell } from "@/lib/csv";
import { duration, formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import Field, { SelectField } from "@/components/studyflow/FormFields";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UserStatusAction from "./UserStatusAction";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
interface Props {
  initial: Workspace;
}
/** Search and sort learner accounts without accessing private study content. */
export default function AdminUsers({ initial }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const clock = useNow();
  const now = clock || Date.parse(initial.user.lastActiveAt);
  const [status, setStatus] = useState("");
  const [activity, setActivity] = useState("");
  const [joined, setJoined] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("name");
  const [direction, setDirection] = useState("asc");
  const users = data.users
    .filter((user) => {
      const studied = getSessions(data,user.id).some(session => Date.parse(session.startedAt) >= now - 7*86400000 && Date.parse(session.startedAt) <= now);
      return (!status || user.status === status) && (!joined || Date.parse(user.createdAt) >= now-Number(joined)*86400000) && (!activity || (activity === 'recent' ? studied : !studied)) && (user.name+' '+user.email).toLowerCase().includes(query.toLowerCase());
    })
    .sort((a, b) => {
      const diff =
        sort === "studyTime"
          ? totalSeconds(getSessions(data, a.id)) -
            totalSeconds(getSessions(data, b.id))
          : String(
              a[
                sort as
                  "name" | "email" | "createdAt" | "lastActiveAt" | "status"
              ],
            ).localeCompare(
              String(
                b[
                  sort as
                    "name" | "email" | "createdAt" | "lastActiveAt" | "status"
                ],
              ),
            );
      return direction === "asc" ? diff : -diff;
    });
  const pages = Math.max(1,Math.ceil(users.length/10));
  const currentPage = Math.min(page,pages);
  const visible = users.slice((currentPage-1)*10,currentPage*10);
  const cell = "px-4 py-4 text-start text-sm whitespace-nowrap";
  return (
    <>
      <PageHeader
        title={t("users")}
        description={t("usersDescription")}
        action={
          <Button
            variant="outline"
            onClick={() => {
              const rows = [
                [
                  t("name"),
                  t("email"),
                  t("joined"),
                  t("lastActive"),
                  t("studyTime"),
                  t("status"),
                ],
                ...users.map((user) => [
                  user.name,
                  user.email,
                  user.createdAt,
                  user.lastActiveAt,
                  duration(totalSeconds(getSessions(data, user.id))),
                  t(user.status),
                ]),
              ];
              const csv = rows
                .map((row) =>
                  row
                    .map(csvCell)
                    .join(","),
                )
                .join("\r\n");
              const url = URL.createObjectURL(
                new Blob([csv], { type: "text/csv;charset=utf-8" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = "learners.csv";
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("exportUsers")}
          </Button>
        }
      />
      <div className="sf-filter-bar mb-6 grid gap-4 sm:grid-cols-3">
        <Field
          label={t("searchUsers")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SelectField
          label={t("sortBy")}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          {[
            ["name", "name"],
            ["email", "email"],
            ["createdAt", "joined"],
            ["lastActiveAt", "lastActive"],
            ["studyTime", "studyTime"],
            ["status", "status"],
          ].map(([value, key]) => (
            <option key={value} value={value}>
              {t(key)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t("sortOrder")}
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
        >
          <option value="asc">{t("ascending")}</option>
          <option value="desc">{t("descending")}</option>
        </SelectField>
      <SelectField label={t("status")} value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">{t("redesign.allStatuses")}</option><option value="active">{t("active")}</option><option value="inactive">{t("inactive")}</option></SelectField>
        <SelectField label={t("redesign.activityFilter")} value={activity} onChange={event=>{setActivity(event.target.value);setPage(1);}}><option value="">{t("redesign.allActivity")}</option><option value="recent">{t("redesign.studiedWeek")}</option><option value="none">{t("redesign.noRecentStudy")}</option></SelectField>
        <SelectField label={t("redesign.joinedFilter")} value={joined} onChange={event=>{setJoined(event.target.value);setPage(1);}}><option value="">{t("redesign.joinedAny")}</option><option value="30">{t("redesign.joined30")}</option><option value="90">{t("redesign.joined90")}</option></SelectField>
      </div>
      {users.length ? (
        <>
        <div className="space-y-3 sm:hidden">
          {visible.map((user) => (
            <article key={user.id} className="sf-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/admin/users/${user.id}`} className="font-medium text-brand-600 dark:text-brand-300">{user.name}</Link>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                </div>
                <Badge color={user.status === "active" ? "success" : "light"}>{t(user.status)}</Badge>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 pt-4 text-xs dark:border-gray-800">
                <div><dt className="text-muted">{t("lastActive")}</dt><dd className="mt-1">{formatDate(user.lastActiveAt, data.user.timezone, locale)}</dd></div>
                <div><dt className="text-muted">{t("studyTime")}</dt><dd className="mt-1">{duration(totalSeconds(getSessions(data, user.id)))}</dd></div>
              </dl>
              <div className="mt-4"><UserStatusAction data={data} user={user} /></div>
            </article>
          ))}
        </div>
        <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block dark:border-gray-800 dark:bg-white/3">
          <Table>
            <TableHeader className="bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
              <TableRow>
                {[
                  "name",
                  "email",
                  "redesign.accountRole",
                  "joined",
                  "lastActive",
                  "studyTime",
                  "status",
                  "actions",
                ].map((key) => (
                  <TableCell key={key} isHeader className={cell}>
                    {t(key)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((user) => (
                <TableRow
                  key={user.id}
                  className="border-t border-gray-100 dark:border-gray-800"
                >
                  <TableCell className={cell}>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-brand-600 dark:text-brand-300"
                    >
                      {user.name}
                    </Link>
                  </TableCell>
                  <TableCell className={cell}>{user.email}</TableCell>
                  <TableCell className={cell}>{t(user.role === "admin" ? "admin" : "learner")}</TableCell>
                  <TableCell className={cell}>
                    {formatDate(user.createdAt, data.user.timezone, locale)}
                  </TableCell>
                  <TableCell className={cell}>
                    {formatDate(user.lastActiveAt, data.user.timezone, locale)}
                  </TableCell>
                  <TableCell className={cell}>
                    {duration(totalSeconds(getSessions(data, user.id)))}
                  </TableCell>
                  <TableCell className={cell}>
                    <Badge
                      color={user.status === "active" ? "success" : "light"}
                    >
                      {t(user.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className={cell}>
                    <UserStatusAction data={data} user={user} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div></>
      ) : (
        <EmptyState title={t("noUsers")} />
      )}
      <div className="mt-5 flex items-center justify-between gap-3"><span className="text-sm text-muted">{t("redesign.pageOf",{page:currentPage,total:pages})}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>{t("redesign.previous")}</Button><Button variant="outline" size="sm" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>{t("redesign.next")}</Button></div></div>
    </>
  );
}
