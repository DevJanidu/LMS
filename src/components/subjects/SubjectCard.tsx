"use client";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subjectProgress, totalSeconds } from "@/lib/analytics";
import { duration, formatDate } from "@/lib/time";
import type { StudySession, Subject, Topic } from "@/types";
import ProgressBar, { accentClasses } from "@/components/studyflow/ProgressBar";
interface Props {
  subject: Subject;
  topics: Topic[];
  sessions: StudySession[];
  timezone: string;
  compact?: boolean;
}
/** Subject summary shared by dashboard and library. */
export default function SubjectCard({
  subject,
  topics,
  sessions,
  timezone,
  compact = false,
}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const progress = subjectProgress(topics);
  return (
    <Link
      href={`/subjects/${subject.id}`}
      className={`block rounded-xl transition hover:bg-gray-50 dark:hover:bg-gray-800/50 ${compact ? "p-3" : "border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/3"}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 font-medium text-gray-900 dark:text-white">
          <span
            className={`size-3 shrink-0 rounded-full ${accentClasses[subject.color]}`}
          />
          {subject.title}
        </h2>
        <span className="text-sm font-semibold">{progress}%</span>
      </div>
      <ProgressBar
        value={progress}
        label={subject.title}
        color={subject.color}
      />
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
        <span>
          {topics.length
            ? t("topicCount", {
                completed: topics.filter(
                  (topic) => topic.status === "completed",
                ).length,
                total: topics.length,
              })
            : t("noTopics")}
        </span>
        <span>{duration(totalSeconds(sessions))}</span>
      </div>
      {!compact && (
        <>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {subject.description}
          </p>
          {subject.targetDate && (
            <p className="mt-5 text-theme-xs text-gray-400 dark:text-gray-500">
              {t("targetDate")}:{" "}
              {formatDate(subject.targetDate, timezone, locale)}
            </p>
          )}
        </>
      )}
    </Link>
  );
}
