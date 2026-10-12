"use client";
import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type Ref,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowUpIcon, CloseIcon, StopIcon } from "@/icons";
export interface AvenComposerHandle {
  focus: () => void;
}
interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  generating: boolean;
  enabled: boolean;
  consent: boolean;
  replying?: boolean;
  onCancelReply?: () => void;
  ref?: Ref<AvenComposerHandle>;
}
const MAX_HEIGHT = 200;
export default function AvenComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  generating,
  enabled,
  consent,
  replying,
  onCancelReply,
  ref,
}: Props) {
  const t = useTranslations("aven"),
    id = useId(),
    textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => textarea.current?.focus(),
  }));
  // Measure before paint so the composer grows without a visible jump.
  useLayoutEffect(() => {
    const node = textarea.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
    node.style.overflowY = node.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);
  const canSend = enabled && consent && Boolean(value.trim()) && !generating;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) onSubmit();
  };
  return (
    <form className="aven-composer" onSubmit={submit}>
      {replying && (
        <div className="aven-composer-context">
          <span>{t("replyingToReminder")}</span>
          <button
            type="button"
            className="aven-icon-button"
            aria-label={t("cancelReply")}
            onClick={onCancelReply}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      )}
      <div className="aven-composer-field">
        <label htmlFor={id} className="sr-only">
          {t("message")}
        </label>
        <textarea
          ref={textarea}
          id={id}
          rows={1}
          value={value}
          maxLength={6000}
          disabled={!consent}
          placeholder={t(replying ? "replyPlaceholder" : "messagePlaceholder")}
          aria-describedby={`${id}-help`}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (canSend) onSubmit();
            }
          }}
        />
        {generating ? (
          <button
            type="button"
            className="aven-send-button"
            data-state="stop"
            aria-label={t("stopGeneration")}
            title={t("stopGeneration")}
            onClick={onStop}
          >
            <StopIcon className="size-3.5" />
          </button>
        ) : (
          <button
            type="submit"
            className="aven-send-button"
            aria-label={t("send")}
            title={t("send")}
            disabled={!canSend}
          >
            <ArrowUpIcon className="size-4" />
          </button>
        )}
      </div>
      <p id={`${id}-help`} className="aven-composer-help">
        {t(consent ? "composerHelp" : "consentRequired")}
      </p>
    </form>
  );
}
