"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { CalendarRef } from "@fullcalendar/react";
import { useLocale, useTranslations } from "next-intl";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import { useModal } from "@/hooks/useModal";
import { getSubjects, getTopics } from "@/lib/mock";
import { updateWorkspace, useNow, useWorkspace } from "@/lib/mock/store";
import { localDay, shiftDay, wallTime, zonedToUtc } from "@/lib/analytics";
import { getOccurrences, type BlockOccurrence } from "@/lib/mock/schedule";
import type { Workspace } from "@/types";
import PlannerToolbar, { type PlannerView } from "./PlannerToolbar";
import PlannerEvent from "./PlannerEvent";
import PlannerSkeleton from "./PlannerSkeleton";
import StudyBlockModal from "./StudyBlockModal";
import StudyBlockDetails from "./StudyBlockDetails";
import { useTheme } from "@/context/ThemeContext";
const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => <PlannerSkeleton />,
});
interface Props {
  initial: Workspace;
  add?: boolean;
}
export default function StudyCalendar({ initial, add = false }: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const modal = useModal(add);
  const details = useModal();
  const { theme } = useTheme();
  const clock = useNow();
  const now = clock || Date.parse(initial.user.lastActiveAt);
  const today = localDay(now, data.user.timezone);
  const [range, setRange] = useState({
    from: shiftDay(today, -7),
    to: shiftDay(today, 35),
  });
  const [selected, setSelected] = useState<BlockOccurrence>();
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<string>();
  const [message, setMessage] = useState("");
  const [compact, setCompact] = useState(false);
  const calendar = useRef<CalendarRef>(null);
  const [view, setView] = useState<PlannerView>("timeGridWeek");
  const [visibleDate, setVisibleDate] = useState(today);
  const [rangeTitle, setRangeTitle] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const blocks = data.blocks.filter((b) => b.userId === data.user.id);
  const occurrences = getOccurrences(blocks, range.from, range.to);
  const deadlines = [
    ...getSubjects(data)
      .filter((s) => s.targetDate)
      .map((s) => ({
        id: s.id,
        title: `${t("deadline")}: ${s.title}`,
        start: s.targetDate,
        allDay: true,
        editable: false,
      })),
    ...getTopics(data)
      .filter((s) => s.targetDate && s.status !== "completed")
      .map((s) => ({
        id: s.id,
        title: `${t("deadline")}: ${s.title}`,
        start: s.targetDate,
        allDay: true,
        editable: false,
      })),
  ];
  const open = (occurrence?: BlockOccurrence, day = today, time?: string) => {
    setSelected(occurrence);
    setDate(day);
    setSlot(time);
    modal.openModal();
  };
  const inspect = (item: BlockOccurrence) => {
    setSelected(item);
    details.openModal();
  };
  const move = (
    id: string,
    start: Date | null,
    end: Date | null,
    revert: () => void,
  ) => {
    const occurrence = occurrences.find(
      (item) => `${item.block.id}@${item.date}` === id,
    );
    if (!occurrence || !start || !end) {
      revert();
      return;
    }
    const startsAt = zonedToUtc(
      start.toISOString().slice(0, 16),
      data.user.timezone,
    );
    const endsAt = zonedToUtc(
      end.toISOString().slice(0, 16),
      data.user.timezone,
    );
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      revert();
      return;
    }
    updateWorkspace(initial, (state) => ({
      ...state,
      blocks: state.blocks.map((block) =>
        block.id !== occurrence.block.id
          ? block
          : block.repeat === "once"
            ? {
                ...block,
                startsAt,
                endsAt,
                updatedAt: new Date().toISOString(),
              }
            : {
                ...block,
                updatedAt: new Date().toISOString(),
                exceptions: [
                  ...block.exceptions.filter((e) => e.date !== occurrence.date),
                  {
                    ...block.exceptions.find((e) => e.date === occurrence.date),
                    date: occurrence.date,
                    cancelled: false,
                    startsAt,
                    endsAt,
                  },
                ],
              },
      ),
    }));
    setMessage(t("redesign.scheduleMoved"));
  };
  const month = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${visibleDate}T12:00:00Z`));
  const startingHour = Math.max(
    0,
    Number(
      wallTime(new Date(now).toISOString(), data.user.timezone).slice(11, 13),
    ) - 1,
  );
  return (
    <>
      <section className="sf-planner-workspace">
        <PlannerToolbar
          month={month}
          range={rangeTitle || month}
          timezone={data.user.timezone}
          view={view}
          onSchedule={() => open()}
          onNavigate={(direction) => {
            const api = calendar.current?.getApi();
            if (direction === "today") api?.gotoDate(today);
            else api?.[direction]();
          }}
          onViewChange={(value) => calendar.current?.getApi().changeView(value)}
        />
        <p role="status" className="sr-only">
          {message}
        </p>
        <div className="planner-timetable">
          <FullCalendar
            ref={calendar}
            key={compact ? "compact" : "wide"}
            plugins={[
              dayGridPlugin,
              timeGridPlugin,
              interactionPlugin,
              themePlugin,
            ]}
            initialView={compact ? "timeGridDay" : "timeGridWeek"}
            initialDate={visibleDate}
            timeZone="UTC"
            locale={locale}
            direction={locale === "ar" ? "rtl" : "ltr"}
            firstDay={data.user.weekStartDay}
            colorScheme={theme}
            now={() =>
              `${wallTime(new Date().toISOString(), data.user.timezone)}:00Z`
            }
            nowIndicator
            tableHeaderSticky
            headerToolbar={false}
            className="planner-calendar-theme"
            height="100%"
            scrollTime={`${String(startingHour).padStart(2, "0")}:00:00`}
            scrollTimeReset={false}
            slotDuration="00:30:00"
            slotHeaderInterval="01:00:00"
            slotMinHeight={38}
            dayMaxEvents={2}
            slotLaneClass={(info) =>
              info.isMinor ? "planner-slot planner-slot-minor" : "planner-slot"
            }
            slotHeaderClass="planner-time-label"
            dayHeaderClass="planner-day-header"
            dayHeaderInnerClass="planner-day-header-inner"
            dayLaneClass={(info) =>
              `planner-day-lane ${info.isToday ? "is-today" : ""} ${info.date.getUTCDay() === 0 || info.date.getUTCDay() === 6 ? "is-weekend" : ""}`
            }
            dayHeaderContent={(info) => (
              <div
                className={`planner-day-heading ${info.isToday ? "is-today" : ""}`}
              >
                <span>
                  {new Intl.DateTimeFormat(locale, {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(info.date)}
                </span>
                {info.view.type !== "dayGridMonth" && (
                  <strong>{info.date.getUTCDate()}</strong>
                )}
              </div>
            )}
            eventClass={(info) =>
              `planner-event planner-event-${occurrences.find((o) => `${o.block.id}@${o.date}` === info.event.id)?.block.color ?? "deadline"}`
            }
            eventInnerClass="planner-event-inner"
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
            }}
            eventMinHeight={18}
            eventShortHeight={42}
            slotEventOverlap={false}
            eventContent={(info) => (
              <PlannerEvent
                info={info}
                data={data}
                occurrence={occurrences.find(
                  (o) => `${o.block.id}@${o.date}` === info.event.id,
                )}
              />
            )}
            events={[
              ...occurrences.map((item) => ({
                id: `${item.block.id}@${item.date}`,
                title: item.title,
                start: `${wallTime(item.startsAt, data.user.timezone)}:00Z`,
                end: `${wallTime(item.endsAt, data.user.timezone)}:00Z`,
              })),
              ...deadlines,
            ]}
            datesSet={(info) => {
              setRange({
                from: info.startStr.slice(0, 10),
                to: info.endStr.slice(0, 10),
              });
              setView(info.view.type as PlannerView);
              const formatter = new Intl.DateTimeFormat(locale, {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              });
              setRangeTitle(
                info.view.type === "timeGridWeek"
                  ? formatter.formatRange(
                      info.start,
                      new Date(info.end.getTime() - 86400000),
                    )
                  : info.view.title,
              );
              setVisibleDate(
                (calendar.current?.getApi().getDate() ?? info.start)
                  .toISOString()
                  .slice(0, 10),
              );
            }}
            dateClick={(info) =>
              open(
                undefined,
                info.dateStr.slice(0, 10),
                info.allDay ? undefined : info.dateStr.slice(0, 16),
              )
            }
            eventClick={(info) => {
              const item = occurrences.find(
                (o) => `${o.block.id}@${o.date}` === info.event.id,
              );
              if (item) inspect(item);
              else setDate(info.event.startStr.slice(0, 10));
            }}
            editable
            eventOverlap={false}
            eventDrop={(info) =>
              move(info.event.id, info.event.start, info.event.end, info.revert)
            }
            eventResize={(info) =>
              move(info.event.id, info.event.start, info.event.end, info.revert)
            }
          />
        </div>
      </section>
      {modal.isOpen && (
        <StudyBlockModal
          key={
            selected ? `${selected.block.id}-${selected.date}` : (slot ?? date)
          }
          data={data}
          occurrence={selected}
          date={date}
          startLocal={slot}
          isOpen
          onClose={modal.closeModal}
        />
      )}
      {selected && (
        <StudyBlockDetails
          data={data}
          occurrence={selected}
          isOpen={details.isOpen}
          onClose={details.closeModal}
          onEdit={() => {
            details.closeModal();
            open(selected, selected.date);
          }}
          onDuplicate={() => {
            details.closeModal();
            open(
              {
                ...selected,
                block: {
                  ...selected.block,
                  id: "",
                  repeat: "once",
                  exceptions: [],
                },
              },
              localDay(selected.startsAt, data.user.timezone),
            );
          }}
        />
      )}
    </>
  );
}
