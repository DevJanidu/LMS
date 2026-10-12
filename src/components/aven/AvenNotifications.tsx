"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { featureRequest } from "@/lib/goals/client";
import type { listAvenNotifications } from "@/lib/aven/notifications";
import Pagination from "@/components/studyflow/Pagination";
import NotificationActions from "./NotificationActions";
import { errorKey } from "./types";
type NotificationList = Awaited<ReturnType<typeof listAvenNotifications>>;
interface Props {
  timezone: string;
  onReply: (conversationId: string, notificationId: string) => void;
}
export default function AvenNotifications({ timezone, onReply }: Props) {
  const t = useTranslations("aven"),
    [list, setList] = useState<NotificationList | null>(null),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(""),
    [replying, setReplying] = useState<string>();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void featureRequest<NotificationList>(
      `/api/aven/notifications?page=${page}`,
      undefined,
      controller.signal,
    )
      .then(setList)
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(t(errorKey(t, failure.message)));
      });
    return () => controller.abort();
  }, [page, revision, t]);
  const reply = async (id: string) => {
    if (replying) return;
    setReplying(id);
    setError("");
    try {
      const result = await featureRequest<{ conversationId: string }>(
        "/api/aven/notifications",
        { id, kind: "reply" },
      );
      onReply(result.conversationId, id);
    } catch (failure) {
      setError(t(errorKey(t, (failure as Error).message)));
    } finally {
      setReplying(undefined);
    }
  };
  const markRead = (id: string) => {
    void featureRequest("/api/aven/notifications", { id, kind: "read" })
      .then(() => setRevision((value) => value + 1))
      .catch(() => setError(t("errors.serviceUnavailable")));
  };
  if (!list)
    return (
      <div aria-busy="true" className="space-y-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="aven-skeleton h-20" />
        ))}
      </div>
    );
  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      <ul className="aven-notification-list">
        {list.rows.map((item) => (
          <li key={item.id} data-unread={!item.readAt || undefined}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-primary dark:text-primary text-body-strong">
                  {item.title}
                </h3>
                <p className="text-secondary dark:text-secondary mt-1 text-small whitespace-pre-wrap">
                  {item.body}
                </p>
                <p className="text-muted dark:text-muted mt-1 text-caption">
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleString("en", {
                      timeZone: timezone,
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </p>
              </div>
              {!item.readAt && (
                <button
                  type="button"
                  className="aven-text-button shrink-0"
                  onClick={() => markRead(item.id)}
                >
                  {t("markRead")}
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <NotificationActions
                id={item.id}
                action={item.action}
                timezone={timezone}
                onAsk={() => {
                  void reply(item.id);
                }}
                onChanged={() => setRevision((value) => value + 1)}
              />
              {item.action?.goalId && (
                <Link
                  href={`/goals/${item.action.goalId}`}
                  className="aven-text-button"
                >
                  {t("openGoal")}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!list.rows.length && (
        <p className="text-secondary dark:text-secondary py-10 text-center text-small">
          {t("noNotifications")}
        </p>
      )}
      {list.total > 20 && (
        <Pagination
          page={list.page}
          pages={Math.ceil(list.total / 20)}
          onChange={setPage}
        />
      )}
    </div>
  );
}
