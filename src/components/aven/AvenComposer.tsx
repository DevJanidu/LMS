"use client";
import { useId, useEffect, useRef, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ArrowRightIcon, CloseIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import { controlClass } from "@/components/studyflow/FormFields";
interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  enabled: boolean;
  consent: boolean;
  onStop?: () => void;
}
export default function AvenComposer({
  value,
  onChange,
  onSubmit,
  busy,
  enabled,
  consent,
  onStop,
}: Props) {
  const t = useTranslations("aven"),
    id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    if (value)
      textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, parseFloat(getComputedStyle(textarea.current).maxHeight))}px`;
  }, [value]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <form
      className="aven-composer shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4 dark:border-gray-700 dark:bg-gray-dark"
      onSubmit={submit}
    >
      <label htmlFor={id} className="sr-only">
        {t("message")}
      </label>
      <div className="flex items-end gap-3">
        <textarea
          ref={textarea}
          id={id}
          className={`${controlClass} max-h-40 min-h-12 resize-none`}
          rows={2}
          placeholder={t("messagePlaceholder")}
          aria-describedby={`${id}-help`}
          value={value}
          maxLength={6000}
          required
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button
          type={busy ? "button" : "submit"}
          aria-label={t(busy ? "stopGeneration" : "send")}
          onClick={busy ? onStop : undefined}
          disabled={!busy && (!value.trim() || !enabled || !consent)}
          className="shrink-0"
          endIcon={
            busy ? (
              <CloseIcon className="size-4" />
            ) : (
              <ArrowRightIcon className="size-4 rtl:rotate-180" />
            )
          }
        >
          <span className="hidden sm:inline">
            {t(busy ? "stopGeneration" : "send")}
          </span>
        </Button>
      </div>
      <p
        id={`${id}-help`}
        className={`text-muted dark:text-muted mt-2 text-caption ${consent && !busy ? "hidden sm:block" : ""}`}
      >
        {t(!consent ? "consentRequired" : "composerHelp")}
      </p>
    </form>
  );
}
