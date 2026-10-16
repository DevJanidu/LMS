"use client";
import { useFormatter, useTranslations } from "next-intl";
import { compactDuration } from "@/lib/time";
import PersonAvatar from "./PersonAvatar";
import type { FeedItem } from "./types";

/** Real events only: credited sessions, streaks, weekly milestones and group wins. */
export default function ActivityFeed({ items, now }: { items: FeedItem[]; now: number }) {
  const t = useTranslations("circles.feed");
  const format = useFormatter();
  if (!items.length) return <p className="sc-empty">{t("empty")}</p>;
  return (
    <ol className="sc-feed">
      {items.map(item => {
        const text = item.kind === "session" ? (item.subject ? t("sessionSubject", { time: compactDuration(item.value), subject: item.subject }) : t("session", { time: compactDuration(item.value) }))
          : item.kind === "streak" ? t("streak", { days: item.value })
          : item.kind === "weeklyHours" ? t("weeklyHours", { hours: item.value })
          : item.kind === "groupWin" ? t("groupWin", { group: item.group ?? "" })
          : t("achievement");
        return (
          <li key={item.id} className="sc-feed-item">
            <PersonAvatar name={item.name} image={item.image} size="sm" />
            <p className="min-w-0">
              <strong>{item.me ? t("you") : item.name}</strong> {text}
              <span className="sc-muted"> · {format.relativeTime(new Date(item.createdAt), new Date(now))}</span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
