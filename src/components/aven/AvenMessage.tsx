"use client";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { RefreshIcon, SparklesIcon } from "@/icons";
import { storedComponents } from "@/lib/aven/ui-components";
import AvenMarkdown from "./AvenMarkdown";
import AvenCopyButton from "./AvenCopyButton";
import AvenGenerativeUI from "./AvenGenerativeUI";
import NotificationActions from "./NotificationActions";
import { useSmoothText } from "./useSmoothText";
import type { AvenMessageRecord } from "./types";
interface Props {
  message: AvenMessageRecord;
  timezone: string;
  streaming: boolean;
  latest: boolean;
  disabled: boolean;
  /** New in this session (not restored history), so it animates in. */
  enter?: boolean;
  onRetry: (message: AvenMessageRecord) => void;
  onRegenerate: (message: AvenMessageRecord) => void;
  onAsk: (notificationId: string) => void;
}
function AvenMessage({
  message,
  timezone,
  streaming,
  latest,
  disabled,
  enter,
  onRetry,
  onRegenerate,
  onAsk,
}: Props) {
  const t = useTranslations("aven"),
    m = useTranslations("aven.models");
  // Live cards (with placeholders) while streaming; saved, re-validated cards afterwards.
  const components = useMemo(
    () => message.components ?? storedComponents(message.context),
    [message.components, message.context],
  );
  const text = useSmoothText(message.content, streaming);
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      })
    : null;
  if (message.role === "user")
    return (
      <div className="aven-message" data-role="user" data-enter={enter || undefined}>
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
      data-streaming={streaming || undefined}
      data-enter={enter || undefined}
    >
      {notificationId && (
        <p className="aven-message-eyebrow">
          <SparklesIcon className="size-3.5" />
          {t("proactiveLabel")}
        </p>
      )}
      {!code && text && <AvenMarkdown text={text} streaming={streaming} />}
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
      <AvenGenerativeUI
        components={components}
        requestId={message.requestId}
        context={message.context}
        persist={Boolean(message.requestId)}
      />
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
          {message.context?.modelLabel && (
            <span className="aven-message-meta aven-message-model" title={message.context.apiModel}>
              {message.context.modelLabel}
              {message.context.reasoning && message.context.reasoning !== "auto"
                ? ` · ${m(`modes.${message.context.reasoning}.label`)}`
                : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
export default memo(AvenMessage);
