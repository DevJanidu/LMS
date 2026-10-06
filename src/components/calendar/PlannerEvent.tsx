"use client";
import type { EventDisplayInfo } from "@fullcalendar/react";
import type { BlockOccurrence } from "@/lib/mock/schedule";
import type { Workspace } from "@/types";
interface Props {
  info: EventDisplayInfo;
  occurrence?: BlockOccurrence;
  data: Workspace;
}
export default function PlannerEvent({ info, occurrence, data }: Props) {
  const subject = data.subjects.find(
    (item) => item.id === occurrence?.block.subjectId,
  );
  const topic = data.topics.find(
    (item) => item.id === occurrence?.block.topicId,
  );
  const minutes = occurrence
    ? (Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)) / 60000
    : 0;
  const brief = info.isShort || (minutes > 0 && minutes <= 45);
  const tiny = minutes > 0 && (minutes <= 20 || (info.isShort && minutes <= 30));
  const month = info.view.type === "dayGridMonth" || info.event.allDay;
  const title = subject?.title ?? info.event.title;
  const detail = topic?.title ?? occurrence?.title;
  return (
    <div
      className={`planner-event-content ${brief ? "is-brief" : ""} ${tiny ? "is-tiny" : ""} ${month ? "is-summary" : ""}`}
      title={[title, detail, info.timeText].filter(Boolean).join(" · ")}
    >
      <span className="planner-event-title">{title}</span>
      {!month && !brief && detail && detail !== title && (
        <span className="planner-event-topic">{detail}</span>
      )}
      {!month && !tiny && <span className="planner-event-time">{info.timeText}</span>}
    </div>
  );
}
