import { useTranslations } from "next-intl";
import { RefreshIcon } from "@/icons";

interface Block {
  day: number;
  start: number;
  length: number;
  title: string;
  time: string;
  tone?: "teal" | "amber";
}

/** Study Planner week view with recurring and one-off study blocks. */
export default function PlannerPreview() {
  const t = useTranslations("marketing.preview.planner");
  const days = t.raw("days") as string[];
  const blocks = t.raw("blocks") as Block[];
  return (
    <div className="mk-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <p className="text-body-strong">{t("title")}</p>
          <p className="mk-muted">{t("range")}</p>
        </div>
        <span className="mk-chip mk-chip-brand"><RefreshIcon className="size-3" />{t("recurring")}</span>
      </div>
      <div className="mk-planner">
        <div className="mk-planner-head" />
        {days.map((day, index) => (
          <div key={day} className="mk-planner-head" data-today={index === 1}>
            {day}
            <b>{14 + index}</b>
          </div>
        ))}
        <div className="mk-planner-time">
          {["8", "10", "12", "14", "16"].map((hour) => <span key={hour}>{hour}:00</span>)}
        </div>
        {days.map((day, index) => (
          <div key={day} className="mk-planner-col">
            {blocks
              .filter((block) => block.day === index)
              .map((block) => (
                <div
                  key={block.title + block.start}
                  className="mk-block"
                  data-tone={block.tone}
                  style={{ top: `${block.start * 3}rem`, height: `calc(${block.length * 3}rem - .25rem)` }}
                >
                  {block.title}
                  <span>{block.time}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
