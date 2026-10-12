"use client";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Workspace } from "@/types";
import type { BlockOccurrence } from "@/lib/schedule";
import { useNow } from "@/lib/workspace/store";
import { duration } from "@/lib/time";
import AttendSessionButton from "@/components/study/AttendSessionButton";
import useAttendance from "@/hooks/useAttendance";
import { attendanceFor, attendanceStatus } from "@/lib/study/attendance-model";
import DashboardPanel, { PanelEmpty } from "./DashboardPanel";
interface Props {
  data: Workspace;
  blocks: BlockOccurrence[];
  next?: BlockOccurrence;
}
/** Today's planned sessions as a compact timeline; the next open session can be started directly. */
export default function TodayPlan({ data, blocks, next }: Props) {
  const t = useTranslations("studyflow"),
    d = useTranslations("studyflow.dashboard");
  const locale = useLocale();
  const attendance = useAttendance(data.user.updatedAt);
  const now =
    useNow(60000) || Date.parse(data.loadedAt ?? data.user.lastActiveAt);
  const status = (item: BlockOccurrence) =>
    attendance.loading
      ? null
      : attendance.error
        ? "unknown"
        : attendanceStatus(item, attendance.records, now);
  // The featured session is the first one that is still open and not finished.
  const featured = blocks.find(
    (item) =>
      attendanceFor(item, attendance.records)?.status !== "completed" &&
      Date.parse(item.endsAt) > now,
  );
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: data.user.timezone,
    }).format(new Date(value));
  const subjectTitle = (item: BlockOccurrence) =>
    data.subjects.find((subject) => subject.id === item.block.subjectId)
      ?.title;
  return (
    <DashboardPanel
      title={d("todayTitle")}
      action={{ href: "/calendar", label: t("calendar") }}
    >
      {blocks.length ? (
        <ol className="sf-timeline">
          {blocks.map((item) => {
            const state = status(item);
            const current = item === featured;
            return (
              <li
                key={`${item.block.id}-${item.date}`}
                className="sf-timeline-item"
                data-current={current || undefined}
                data-state={state ?? undefined}
              >
                <time dateTime={item.startsAt}>{time(item.startsAt)}</time>
                <span className="sf-timeline-dot" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="sf-row-title">{item.title}</p>
                  <p className="sf-row-meta">
                    {[
                      subjectTitle(item),
                      duration(
                        (Date.parse(item.endsAt) - Date.parse(item.startsAt)) /
                          1000,
                      ),
                      state && state !== "unknown"
                        ? t(`attendanceStatus.${state}`)
                        : state === "unknown"
                          ? t(attendance.error!)
                          : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {current && (
                    <div className="sf-timeline-action">
                      <AttendSessionButton
                        data={data}
                        occurrence={item}
                        status={attendanceFor(item, attendance.records)?.status}
                        loading={
                          attendance.loading || Boolean(attendance.error)
                        }
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <PanelEmpty
          message={
            next
              ? d("nothingTodayNext", {
                  title: next.title,
                  when: new Intl.DateTimeFormat(locale, {
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: data.user.timezone,
                  }).format(new Date(next.startsAt)),
                })
              : d("nothingToday")
          }
          action={
            <span className="sf-panel-actions">
              <Link href="/study" className="sf-action-secondary">
                {t("startStudying")}
              </Link>
              <Link href="/calendar?add=1" className="sf-action-ghost">
                {t("scheduleStudy")}
              </Link>
            </span>
          }
        />
      )}
    </DashboardPanel>
  );
}
