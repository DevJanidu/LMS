"use client";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CalendarRef } from "@fullcalendar/react";
import { useLocale, useTranslations } from "next-intl";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import themePlugin from "@fullcalendar/react/themes/classic";
import { useModal } from "@/hooks/useModal";
import { getSubjects, getTopics } from "@/lib/workspace/queries";
import { useCalendar } from "@/lib/calendar/useCalendar";
import { calendarOccurrences, occurrenceId } from "@/lib/calendar/model";
import { localDay, shiftDay, wallTime, weekStart, zonedToUtc } from "@/lib/analytics";
import type { BlockOccurrence } from "@/lib/schedule";
import type { Workspace } from "@/types";
import PlannerToolbar, { type PlannerView } from "./PlannerToolbar";
import PlannerEvent from "./PlannerEvent";
import PlannerSkeleton from "./PlannerSkeleton";
import StudyBlockModal from "./StudyBlockModal";
import StudyBlockDetails from "./StudyBlockDetails";
import { useTheme } from "@/context/ThemeContext";
import CalendarActionDialog, { type CalendarAction } from "./CalendarActionDialog";
import CalendarDeleteTarget from "./CalendarDeleteTarget";
const plugins = [dayGridPlugin, timeGridPlugin, interactionPlugin, themePlugin];
const FullCalendar = dynamic(() => import("@fullcalendar/react"), {
  ssr: false,
  loading: () => <PlannerSkeleton />,
});
interface Props {
  initial: Workspace;
  add?: boolean;
}
export default function StudyCalendar({ initial, add = false }: Props) {
  const t = useTranslations("studyflow");
  const locale = useLocale();
  const modal = useModal(add);
  const details = useModal();
  const { theme } = useTheme();
  const now = Date.parse(initial.loadedAt ?? initial.user.lastActiveAt);
  const today = localDay(now, initial.user.timezone);
  const initialWeekStart = weekStart(today, initial.user.weekStartDay);
  const [range, setRange] = useState({ from: initialWeekStart, to: shiftDay(initialWeekStart, 7) });
  const state = useCalendar(initial, { from: initialWeekStart, to: shiftDay(initialWeekStart, 7) }, range);
  const data = useMemo(() => ({ ...initial, blocks: state.blocks }), [initial, state.blocks]);
  const [selected, setSelected] = useState<BlockOccurrence>();
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<string>();
  const [message, setMessage] = useState("");
  const [compact, setCompact] = useState(false);
  const calendar = useRef<CalendarRef>(null);
  const [view, setView] = useState<PlannerView>("timeGridWeek");
  const [visibleDate, setVisibleDate] = useState(today);
  const [rangeTitle, setRangeTitle] = useState("");
  const [action, setAction] = useState<CalendarAction>();
  const [dragged, setDragged] = useState<BlockOccurrence>();
  const section = useRef<HTMLElement>(null);
  const deleteTarget = useRef<HTMLDivElement>(null);
  const suppressDrop = useRef<string | undefined>(undefined);
  const isOverDelete = (x: number, y: number) => {
    if (deleteTarget.current?.dataset.active !== "true") return false;
    const box = deleteTarget.current?.getBoundingClientRect();
    return Boolean(box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom);
  };
  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const sync = () => {
      setCompact(media.matches);
      if (media.matches && calendar.current?.getApi().view.type === "timeGridWeek") calendar.current.getApi().changeView("timeGridDay");
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const occurrences = useMemo(() => calendarOccurrences(state.blocks, range, data.user.timezone), [state.blocks, range, data.user.timezone]);
  const byId = useMemo(() => new Map(occurrences.map(item => [occurrenceId(item), item])), [occurrences]);
  const deadlines = useMemo(() => [
    ...getSubjects(initial)
      .filter((s) => s.targetDate)
      .map((s) => ({
        id: s.id,
        title: `${t("deadline")}: ${s.title}`,
        start: s.targetDate,
        allDay: true,
        editable: false,
      })),
    ...getTopics(initial)
      .filter((s) => s.targetDate && s.status !== "completed")
      .map((s) => ({
        id: s.id,
        title: `${t("deadline")}: ${s.title}`,
        start: s.targetDate,
        allDay: true,
        editable: false,
      })),
  ], [initial, t]);
  const projectedEvents = useMemo(() => [
    ...occurrences.map(item => ({ id: occurrenceId(item), title: item.title,
      start: `${wallTime(item.startsAt, data.user.timezone)}:00Z`, end: `${wallTime(item.endsAt, data.user.timezone)}:00Z`,
      allDay: false,
    })), ...deadlines,
  ], [occurrences, deadlines, data.user.timezone]);
  // A receipt or range read may update metadata without changing rendered dates.
  // Keep the event input stable so FullCalendar does not rebuild dragged nodes.
  const eventsKey = JSON.stringify(projectedEvents);
  const events = useMemo(() => JSON.parse(eventsKey) as typeof projectedEvents, [eventsKey]);
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
    if (suppressDrop.current === id) { suppressDrop.current = undefined; revert(); return; }
    const occurrence = byId.get(id);
    if (!occurrence || !start || !end) {
      revert();
      return;
    }
    const startsAt = zonedToUtc(
      start.toISOString().slice(0, 16),
      data.user.timezone,
    );
    const resize = end.getTime() - start.getTime() !== Date.parse(`${wallTime(occurrence.endsAt, data.user.timezone)}:00Z`) - Date.parse(`${wallTime(occurrence.startsAt, data.user.timezone)}:00Z`);
    const endsAt = resize ? zonedToUtc(end.toISOString().slice(0, 16), data.user.timezone)
      : new Date(Date.parse(startsAt) + Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)).toISOString();
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      revert();
      return;
    }
    if (occurrence.block.repeat === "weekly") setAction({ kind: "move", occurrence, startsAt, endsAt, revert });
    else void state.store.mutate({ kind: "move", id: occurrence.block.id, date: occurrence.date, scope: "one", startsAt, endsAt }).then(saved => {
      // FullCalendar owns the dragged DOM position. The optimistic store can
      // restore React state, but it cannot move that DOM node back after a
      // failed save, so explicitly invoke its rollback callback as well.
      if (saved) setMessage(t("redesign.scheduleMoved"));
      else {
        revert();
        // A controlled events update may have replaced FullCalendar's original
        // drag snapshot. Restore from the current journal rather than a stale
        // pointer snapshot, including any newer queued change to this event.
        const current = calendarOccurrences(state.store.getSnapshot().blocks, range, data.user.timezone)
          .find(item => occurrenceId(item) === id);
        if (current) calendar.current?.getApi().getEventById(id)?.setDates(
          `${wallTime(current.startsAt, data.user.timezone)}:00Z`,
          `${wallTime(current.endsAt, data.user.timezone)}:00Z`,
        );
      }
    });
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
      <section ref={section} className="sf-planner-workspace relative">
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
        {state.error && <div role="alert" className="flex items-center gap-3 px-4 py-2 text-body text-error-600 dark:text-error-400">
          {t.has(state.error) ? t(state.error) : t("saveFailed")}
          <button type="button" onClick={() => state.canRetry ? void state.store.retry() : void state.store.load(range, true)} className="underline">{t("planner.retry")}</button>
        </div>}
        <p role="status" className="sr-only">{state.loading ? t("planner.loading") : ""}</p>
        <div className="planner-timetable relative" aria-busy={state.loading}>
          {state.loading && <span role="status" className="pointer-events-none absolute end-3 top-2 z-9 rounded-lg bg-white/90 px-3 py-1 text-small text-muted dark:bg-gray-900/90 dark:text-secondary">{t("planner.loading")}</span>}
          <FullCalendar
            ref={calendar}
            plugins={plugins}
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
            snapDuration="00:30:00"
            dragScroll
            eventDragMinDistance={6}
            dragRevertDuration={150}
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
              `planner-event planner-event-${byId.get(info.event.id)?.block.color ?? "deadline"} ${state.pending.has(byId.get(info.event.id)?.block.id ?? "") ? "opacity-70" : ""}`
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
                occurrence={byId.get(info.event.id)}
              />
            )}
            events={events}
            datesSet={(info) => {
              const from = info.startStr.slice(0, 10);
              const to = info.endStr.slice(0, 10);
              setRange((current) => current.from === from && current.to === to ? current : { from, to });
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
              const item = byId.get(info.event.id);
              if (item) inspect(item);
              else setDate(info.event.startStr.slice(0, 10));
            }}
            editable
            eventDragStart={(info) => { suppressDrop.current = undefined; setDragged(byId.get(info.event.id)); }}
            eventDragStop={(info) => {
              const item = byId.get(info.event.id);
              if (item && isOverDelete(info.jsEvent.clientX, info.jsEvent.clientY)) {
                suppressDrop.current = info.event.id;
                setAction({ kind: "delete", occurrence: item });
              }
              setDragged(undefined);
            }}
            eventAllow={(span) => !span.allDay || calendar.current?.getApi().view.type === "dayGridMonth"}
            eventOverlap={false}
            eventDrop={(info) =>
              move(info.event.id, info.event.start, info.event.end, info.revert)
            }
            eventResize={(info) =>
              move(info.event.id, info.event.start, info.event.end, info.revert)
            }
          />
        </div>
        <CalendarDeleteTarget ref={deleteTarget} area={section} active={Boolean(dragged)} />
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
          onSave={command => state.store.mutate(command)}
        />
      )}
      {selected && (
        <StudyBlockDetails
          data={data}
          occurrence={selected}
          isOpen={details.isOpen}
          onClose={details.closeModal}
          onDelete={() => { details.closeModal(); setAction({ kind: "delete", occurrence: selected }); }}
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
      {action && <CalendarActionDialog action={action} onClose={() => { action.revert?.(); setAction(undefined); }}
        onConfirm={scope => {
          const target = { id: action.occurrence.block.id, date: action.occurrence.date, scope, newSeriesId: crypto.randomUUID() };
          void state.store.mutate(action.kind === "delete" ? { kind: "delete", ...target }
            : { kind: "move", ...target, startsAt: action.startsAt!, endsAt: action.endsAt! });
          setAction(undefined);
        }} />}
    </>
  );
}
