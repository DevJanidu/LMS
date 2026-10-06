import type { Notification, Workspace } from "@/types";
import { localDay, shiftDay, zonedToUtc } from "@/lib/analytics";
import { getOccurrences } from "./schedule";
import { getSubjects, getTopics } from "./index";
/** Reminders are derived from the learner's current plan and deadlines. */
export function getNotifications(data: Workspace, now: number): Notification[] {
  const today = localDay(now, data.user.timezone);
  const until = shiftDay(today, 7);
  const blocks = getOccurrences(
    data.blocks.filter((block) => block.userId === data.user.id),
    shiftDay(today, -1),
    until,
  )
    .filter((item) => Date.parse(item.startsAt) >= now)
    .slice(0, 3);
  const items: Notification[] = blocks.map((item) => ({
    id: `block:${item.block.id}:${item.date}`,
    userId: data.user.id,
    type: "block",
    title: item.title,
    body: "",
    scheduledFor: item.startsAt,
    createdAt: item.block.createdAt,
  }));
  for (const subject of getSubjects(data))
    if (
      subject.status === "active" &&
      subject.targetDate &&
      subject.targetDate >= today &&
      subject.targetDate <= until
    )
      items.push({
        id: `subject:${subject.id}`,
        userId: data.user.id,
        type: "subjectDeadline",
        title: subject.title,
        body: "",
        scheduledFor: zonedToUtc(
          `${subject.targetDate}T09:00`,
          data.user.timezone,
        ),
        createdAt: subject.createdAt,
      });
  for (const topic of getTopics(data))
    if (
      topic.status !== "completed" &&
      topic.targetDate &&
      topic.targetDate >= today &&
      topic.targetDate <= until
    )
      items.push({
        id: `topic:${topic.id}`,
        userId: data.user.id,
        type: "topicDeadline",
        title: topic.title,
        body: "",
        scheduledFor: zonedToUtc(
          `${topic.targetDate}T09:00`,
          data.user.timezone,
        ),
        createdAt: topic.createdAt,
      });
  return items
    .map((item) => ({
      ...item,
      readAt: data.notifications.find((saved) => saved.id === item.id)?.readAt,
    }))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}
