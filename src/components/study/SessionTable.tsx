"use client";
import { useLocale, useTranslations } from "next-intl";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { duration, formatDate } from "@/lib/time";
import type { StudySession, Workspace } from "@/types";
import EmptyState from "@/components/studyflow/EmptyState";
import { Link } from "@/i18n/navigation";
import { primaryLink } from "@/components/studyflow/WorkspaceShell";
interface Props {
  sessions: StudySession[];
  data: Workspace;
  onEdit?: (session: StudySession) => void;
  onDelete?: (session: StudySession) => void;
}
/** Responsive sessions table reusable on dashboard and subject detail. */
export default function SessionTable({
  sessions,
  data,
  onEdit,
  onDelete,
}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  if (!sessions.length)
    return (
      <EmptyState
        title={t("noSessions")}
        description={t("noSessionsHelp")}
        action={
          <Link href="/study" className={primaryLink}>
            {t("startStudying")}
          </Link>
        }
      />
    );
  const cell = "px-4 py-4 text-start text-sm";
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="border-b border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          <TableRow>
            {[
              "subject",
              "topic",
              "duration",
              "date",
              ...(onEdit ? ["actions"] : []),
            ].map((key) => (
              <TableCell key={key} isHeader className={cell}>
                {t(key)}
              </TableCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow
              key={session.id}
              className="border-b border-gray-100 dark:border-gray-800"
            >
              <TableCell className={cell}>
                {
                  data.subjects.find(
                    (subject) => subject.id === session.subjectId,
                  )?.title
                }
              </TableCell>
              <TableCell className={`${cell} text-gray-500 dark:text-gray-400`}>
                {data.topics.find((topic) => topic.id === session.topicId)
                  ?.title ?? "—"}
              </TableCell>
              <TableCell className={`${cell} font-medium whitespace-nowrap`}>
                {duration(session.durationSeconds)}
              </TableCell>
              <TableCell
                className={`${cell} whitespace-nowrap text-gray-500 dark:text-gray-400`}
              >
                {formatDate(
                  session.startedAt,
                  data.user.timezone,
                  locale,
                  true,
                )}
              </TableCell>
              {onEdit && (
                <TableCell className={cell}>
                  <div className="flex gap-3">
                    <button
                      onClick={() => onEdit(session)}
                      className="text-brand-600 dark:text-brand-300"
                    >
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => onDelete?.(session)}
                      className="text-error-600 dark:text-error-400"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
