"use client";
import { useTranslations } from "next-intl";
import { ArrowRightIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
export type PlannerView = "timeGridDay" | "timeGridWeek" | "dayGridMonth";
interface Props {
  month: string;
  range: string;
  timezone: string;
  view: PlannerView;
  onNavigate: (direction: "prev" | "next" | "today") => void;
  onViewChange: (view: PlannerView) => void;
  onSchedule: () => void;
}
export default function PlannerToolbar({
  month,
  range,
  timezone,
  view,
  onNavigate,
  onViewChange,
  onSchedule,
}: Props) {
  const t = useTranslations("studyflow");
  return (
    <header className="planner-toolbar">
      <div className="planner-title-row">
        <div>
          <h1>{t("calendar")}</h1>
          <p>{month}</p>
        </div>
        <Button onClick={onSchedule}>
          <span aria-hidden="true">+</span>
          {t("scheduleStudy")}
        </Button>
      </div>
      <div className="planner-controls">
        <div className="planner-navigation">
          <button
            onClick={() => onNavigate("prev")}
            aria-label={t("redesign.previous")}
          >
            <ArrowRightIcon className="size-4 rotate-180 rtl:rotate-0" />
          </button>
          <button
            className="planner-today-button"
            onClick={() => onNavigate("today")}
          >
            {t("today")}
          </button>
          <button
            onClick={() => onNavigate("next")}
            aria-label={t("redesign.next")}
          >
            <ArrowRightIcon className="size-4 rtl:rotate-180" />
          </button>
        </div>
        <h2 className="planner-range" aria-live="polite">
          {range}
        </h2>
        <div className="planner-view-controls">
          <span className="planner-timezone">{timezone}</span>
          <div
            className="planner-view-switch"
            role="group"
            aria-label={t("period")}
          >
            {(
              [
                ["timeGridDay", "plannerDay"],
                ["timeGridWeek", "week"],
                ["dayGridMonth", "month"],
              ] as const
            ).map(([value, key]) => (
              <button
                key={value}
                aria-pressed={view === value}
                onClick={() => onViewChange(value)}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
