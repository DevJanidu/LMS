"use client";
import TextLink from "@/components/studyflow/TextLink";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Workspace } from "@/types";
import type { BlockOccurrence } from "@/lib/schedule";
import { useNow } from "@/lib/workspace/store";
import { duration } from "@/lib/time";
import { primaryLink } from "@/components/studyflow/styles";
import AttendSessionButton from "@/components/study/AttendSessionButton";
import useAttendance from "@/hooks/useAttendance";
import { attendanceFor, attendanceStatus } from "@/lib/study/attendance-model";
interface Props {
  data: Workspace;
  today: string;
  blocks: BlockOccurrence[];
  next?: BlockOccurrence;
}
export default function TodayPlan({ data, today, blocks, next }: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const attendance = useAttendance(data.user.updatedAt);
  const pendingBlocks = blocks.filter(
    (item) => attendanceFor(item, attendance.records)?.status !== "completed",
  );
  const now =
    useNow(60000) || Date.parse(data.loadedAt ?? data.user.lastActiveAt);
  const featured =
    pendingBlocks.find((item) => Date.parse(item.endsAt) > now) ??
    pendingBlocks[0];
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: data.user.timezone,
    }).format(new Date(value));
  return (
    <section className="sf-today">
      <div className="sf-today-heading">
        <div>
          <p className="sf-eyebrow">{t("today")}</p>
          <p className="text-muted mt-1 text-body">
            {new Intl.DateTimeFormat(locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${today}T12:00:00Z`))}
          </p>
        </div>
        <TextLink href="/calendar">{t("calendar")}</TextLink>
      </div>
      <div className="sf-next">
        <div>
          <p className="sf-eyebrow mb-2">
            {t(featured ? "nextStudyBlock" : "redesign.openSpace")}
          </p>
          {featured && (
            <p className="sf-next-time mb-2">{time(featured.startsAt)}</p>
          )}
          <h3>{featured?.title ?? t("redesign.makeProgress")}</h3>
          {featured && (
            <p className="text-muted dark:text-muted mt-2 text-small">
              {attendance.loading
                ? t("loading")
                : attendance.error
                  ? t(attendance.error)
                  : t(
                      `attendanceStatus.${attendanceStatus(featured, attendance.records, now)}`,
                    )}
            </p>
          )}
          <p className="text-muted mt-2 text-body">
            {featured
              ? `${data.subjects.find((s) => s.id === featured.block.subjectId)?.title ?? ""} · ${duration((Date.parse(featured.endsAt) - Date.parse(featured.startsAt)) / 1000)}`
              : t("redesign.smallStep")}
          </p>
        </div>
        <>
          {featured ? (
            <AttendSessionButton
              data={data}
              occurrence={featured}
              status={attendanceFor(featured, attendance.records)?.status}
              loading={attendance.loading || Boolean(attendance.error)}
            />
          ) : (
            <Link href="/study" className={primaryLink}>
              {t("startStudying")}
            </Link>
          )}
        </>
      </div>
      {pendingBlocks
        .filter((item) => item !== featured)
        .slice(0, 3)
        .map((item) => (
          <Link
            key={`${item.block.id}-${item.date}`}
            href="/calendar"
            className="sf-agenda-item"
          >
            <time>{time(item.startsAt)}</time>
            <span className="text-body">
              {item.title}
              <span className="text-muted dark:text-muted ms-2 text-small">
                {attendance.loading
                  ? t("loading")
                  : attendance.error
                    ? t(attendance.error)
                    : t(
                        `attendanceStatus.${attendanceStatus(item, attendance.records, now)}`,
                      )}
              </span>
            </span>
          </Link>
        ))}
      {!featured && (
        <TextLink href="/calendar?add=1" className="sf-agenda-item">
          {next ? `${t("nextStudyBlock")}: ${next.title}` : t("scheduleStudy")}
        </TextLink>
      )}
    </section>
  );
}
