"use client";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { RefreshIcon, SparklesIcon } from "@/icons";
import { goalCardsSchema } from "@/lib/aven/validation";
import AvenMarkdown from "./AvenMarkdown";
import AvenCopyButton from "./AvenCopyButton";
import GoalProgressCard from "./cards/GoalProgressCard";
import NotificationActions from "./NotificationActions";
import type { AvenMessageRecord } from "./types";
interface Props {
  message: AvenMessageRecord;
  timezone: string;
  streaming: boolean;
  latest: boolean;
  disabled: boolean;
  onRetry: (message: AvenMessageRecord) => void;
  onRegenerate: (message: AvenMessageRecord) => void;
  onAsk: (notificationId: string) => void;
}
function parseCards(raw?: string) {
  if (!raw) return [];
  try {
    const parsed = goalCardsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
function AvenMessage({
  message,
  timezone,
  streaming,
  latest,
  disabled,
  onRetry,
  onRegenerate,
  onAsk,
}: Props) {
  const t = useTranslations("aven");
  const cards = useMemo(
    () => parseCards(message.context?.goalCards),
    [message.context?.goalCards],
  );
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      })
    : null;
  if (message.role === "user")
    return (
      <div className="aven-message" data-role="user">
        <div className="aven-user-bubble">{message.content}</div>
        {message.status === "notSent" && (
          <p className="aven-message-meta" data-tone="error">
            {t("notSent")}
          </p>
        )}
      </div>
    );
  const failed = message.status === "error" || message.status === "cancelled";
  // Failed turns store either an error code or the partial text produced before the failure.
  const code = failed && t.has(`errors.${message.content}`);
  const notificationId = message.context?.notificationId;
  return (
    <div
      className="aven-message"
      data-role="assistant"
      data-latest={latest || undefined}
    >
      {notificationId && (
        <p className="aven-message-eyebrow">
          <SparklesIcon className="size-3.5" />
          {t("proactiveLabel")}
        </p>
      )}
      {!code && message.content && <AvenMarkdown text={message.content} />}
      {failed && (
        <div
          className="aven-message-error"
          data-tone={message.status}
          role={message.status === "error" ? "alert" : undefined}
        >
          <p>
            {t(
              code
                ? `errors.${message.content}`
                : message.status === "cancelled"
                  ? "errors.generationStopped"
                  : "errors.aiUnavailable",
            )}
          </p>
          {latest && (
            <button
              type="button"
              className="aven-chip"
              disabled={disabled}
              onClick={() => onRetry(message)}
            >
              <RefreshIcon className="size-3.5" />
              {t(message.status === "error" ? "retry" : "regenerate")}
            </button>
          )}
        </div>
      )}
      {cards.length > 0 && (
        <div className="aven-card-stack">
          {cards.map((goal) => (
            <GoalProgressCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
      {notificationId && (
        <NotificationActions
          id={notificationId}
          action={message.context}
          timezone={timezone}
          onAsk={() => onAsk(notificationId)}
        />
      )}
      {!streaming && !code && message.content && (
        <div className="aven-message-actions">
          <AvenCopyButton text={message.content} />
          {latest && !failed && !notificationId && (
            <button
              type="button"
              className="aven-icon-button"
              aria-label={t("regenerate")}
              title={t("regenerate")}
              disabled={disabled}
              onClick={() => onRegenerate(message)}
            >
              <RefreshIcon className="size-4" />
            </button>
          )}
          {time && (
            <time dateTime={message.createdAt} className="aven-message-meta">
              {time}
            </time>
          )}
        </div>
      )}
    </div>
  );
}
export default memo(AvenMessage);
