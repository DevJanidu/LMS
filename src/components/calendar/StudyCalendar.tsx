"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import { useModal } from "@/hooks/useModal";
import { getSubjects, getTopics } from "@/lib/mock";
import { useWorkspace } from "@/lib/mock/store";
import { localDay, shiftDay, wallTime } from "@/lib/analytics";
import { getOccurrences, type BlockOccurrence } from "@/lib/mock/schedule";
import { formatDate } from "@/lib/time";
import type { Workspace } from "@/types";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import LoadingSkeleton from "@/components/studyflow/LoadingSkeleton";
import StudyBlockModal from "./StudyBlockModal";
import { useTheme } from "@/context/ThemeContext";
const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => <LoadingSkeleton />,
});
interface Props {
  initial: Workspace;
  add?: boolean;
}
/** Week/month calendar and a small-screen agenda backed by recurrence rules. */
export default function StudyCalendar({ initial, add = false }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const modal = useModal(add);
  const { theme } = useTheme();
  const today = localDay(initial.user.lastActiveAt, data.user.timezone);
  const [range, setRange] = useState({
    from: shiftDay(today, -7),
    to: shiftDay(today, 35),
  });
  const [selected, setSelected] = useState<BlockOccurrence>();
  const [date, setDate] = useState(today);
  const blocks = data.blocks.filter((block) => block.userId === data.user.id);
  const occurrences = getOccurrences(blocks, range.from, range.to);
  const deadlines = [
    ...getSubjects(data)
      .filter((item) => item.targetDate)
      .map((item) => ({
        id: item.id,
        title: `${t("deadline")}: ${item.title}`,
        start: item.targetDate,
        allDay: true,
        editable: false,
      })),
    ...getTopics(data)
      .filter((item) => item.targetDate && item.status !== "completed")
      .map((item) => ({
        id: item.id,
        title: `${t("deadline")}: ${item.title}`,
        start: item.targetDate,
        allDay: true,
        editable: false,
      })),
  ];
  const open = (occurrence?: BlockOccurrence, day = today) => {
    setSelected(occurrence);
    setDate(day);
    modal.openModal();
  };
  return (
    <>
      <PageHeader
        title={t("calendar")}
        description={t("calendarDescription", { timezone: data.user.timezone })}
        action={<Button onClick={() => open()}>{t("scheduleStudy")}</Button>}
      />
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-3 sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <FullCalendar
          plugins={[
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
            themePlugin,
          ]}
          initialView="dayGridMonth"
          initialDate={today}
          timeZone="UTC"
          locale={locale}
          direction={locale === "ar" ? "rtl" : "ltr"}
          firstDay={data.user.weekStartDay}
          colorScheme={theme}
          toolbarClass="flex-wrap! gap-3!"
          toolbarTitleClass="text-lg! sm:text-xl!"
          eventClass={(info) => {
            const occurrence = occurrences.find(
              (item) => `${item.block.id}@${item.date}` === info.event.id,
            );
            return occurrence
              ? `study-event-${occurrence.block.color}`
              : "study-deadline";
          }}
          headerToolbar={{
            start: "prev,next today",
            center: "title",
            end: "dayGridMonth,timeGridWeek",
          }}
          height="auto"
          dayMaxEvents={2}
          events={[
            ...occurrences.map((item) => ({
              id: `${item.block.id}@${item.date}`,
              title: item.title,
              start: `${wallTime(item.startsAt, data.user.timezone)}:00Z`,
              end: `${wallTime(item.endsAt, data.user.timezone)}:00Z`,
              classNames: [`study-event-${item.block.color}`],
            })),
            ...deadlines,
          ]}
          datesSet={(info) =>
            setRange({
              from: info.startStr.slice(0, 10),
              to: info.endStr.slice(0, 10),
            })
          }
          dateClick={(info) => open(undefined, info.dateStr.slice(0, 10))}
          eventClick={(info) => {
            const occurrence = occurrences.find(
              (item) => `${item.block.id}@${item.date}` === info.event.id,
            );
            if (occurrence) open(occurrence, occurrence.date);
          }}
          editable={false}
        />
      </div>
      <div className="mt-5 space-y-3">
        <h2 className="text-lg font-medium">{t("plannedBlocks")}</h2>
        {occurrences.length ? (
          occurrences.map((item) => (
            <button
              key={`${item.block.id}@${item.date}`}
              onClick={() => open(item, item.date)}
              className="flex w-full flex-wrap justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 text-start text-sm dark:border-gray-800 dark:bg-white/3"
            >
              <span>{item.title}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {formatDate(item.startsAt, data.user.timezone, locale, true)}
              </span>
            </button>
          ))
        ) : (
          <EmptyState
            title={t("noBlocks")}
            action={
              <Button onClick={() => open()}>{t("scheduleStudy")}</Button>
            }
          />
        )}
      </div>
      {modal.isOpen && (
        <StudyBlockModal
          key={selected ? `${selected.block.id}-${selected.date}` : date}
          data={data}
          occurrence={selected}
          date={date}
          isOpen
          onClose={modal.closeModal}
        />
      )}
    </>
  );
}
