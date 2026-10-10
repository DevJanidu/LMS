"use client";
import TextLink from "@/components/studyflow/TextLink";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { subjectProgress, totalSeconds } from "@/lib/analytics";
import { duration, formatDate } from "@/lib/time";
import { useUnconfirmedSubject } from "@/lib/workspace/store";
import type { StudySession, Subject, Topic } from "@/types";
import ProgressBar, { accentClasses } from "@/components/studyflow/ProgressBar";
import Button from "@/components/ui/button/Button";
interface Props { subject: Subject; topics: Topic[]; sessions?: StudySession[]; timezone: string; compact?: boolean; onEdit?: () => void; onDelete?: () => void; statistics?: { progress: number; completed: number; total: number; seconds: number; lastStudiedAt?: string } }
export default function SubjectCard({subject, topics, sessions = [], timezone, compact = false, statistics, onEdit, onDelete}: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const unconfirmed = useUnconfirmedSubject(subject.id);
  const progress = statistics?.progress ?? subjectProgress(topics);
  const ordered = [...topics].sort((a,b) => a.sortOrder-b.sortOrder);
  const next = ordered.find(topic => topic.status === "inProgress") ?? ordered.find(topic => topic.status !== "completed");
  return <article className="sf-subject">
    <Link href={`/subjects/${subject.id}`} prefetch={false} aria-disabled={unconfirmed || undefined} aria-busy={unconfirmed || undefined} onClick={event => { if (unconfirmed) event.preventDefault(); }} className="sf-subject-title flex items-center gap-3"><span className={`size-2 shrink-0 rounded-full ${accentClasses[subject.color]}`} />{subject.title}</Link>
    <div><div className="sf-subject-progress mb-2"><strong>{progress}<span className="text-caption text-muted">%</span></strong><span className="text-caption text-muted">{t("topicCount", {completed: topics.filter(topic => topic.status === "completed").length, total: topics.length})}</span></div><ProgressBar value={progress} label={subject.title} color={subject.color} /></div>
    <div className="sf-subject-next"><span className="text-caption text-muted">{t(next ? "redesign.upNext" : topics.length ? "completed" : "topics")}</span><p>{next?.title ?? t(topics.length ? "redesign.allComplete" : "noTopicsHelp")}</p></div>
    {!compact && subject.targetDate && <p className="text-small tabular-nums text-muted">{t("targetDate")}: {formatDate(subject.targetDate, timezone, locale)}</p>}
    <div className="sf-subject-footer"><span>{duration(statistics?.seconds ?? totalSeconds(sessions))} · {t("studyTime")}</span><TextLink prefetch={false} aria-disabled={unconfirmed || undefined} onClick={event => { if (unconfirmed) event.preventDefault(); }} href={subject.status === "archived" ? `/subjects/${subject.id}` : `/study?subject=${subject.id}&topic=${next?.id ?? ""}`}>{t("continue")}</TextLink></div>
    {!compact && (statistics?.lastStudiedAt ?? sessions[0]?.startedAt) && <p className="text-small tabular-nums text-muted">{t("lastActive")}: {formatDate(statistics?.lastStudiedAt ?? sessions[0].startedAt, timezone, locale)}</p>}
    {(onEdit || onDelete) && <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
      {onEdit && <Button variant="outline" size="sm" disabled={unconfirmed} onClick={onEdit}>{t("editSubject")}</Button>}
      {onDelete && <Button variant="outline" size="sm" disabled={unconfirmed} onClick={onDelete}>{t("deleteSubject")}</Button>}
    </div>}
  </article>;
}
