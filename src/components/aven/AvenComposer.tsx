"use client";
import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowUpIcon, CloseIcon, StopIcon } from "@/icons";
import { avenCommands, matchCommands } from "@/lib/aven/commands";
import AvenComposerMenu, { optionId, type MenuOption } from "./AvenComposerMenu";
import {
  activeMentions,
  applySelection,
  findTrigger,
  highlightSegments,
  isBareHelp,
  mentionToken,
  moveActive,
  type ComposerMention,
} from "./composer-model";
import { useMentionSearch } from "./useMentionSearch";
export interface AvenComposerHandle {
  focus: () => void;
}
interface Props {
  value: string;
  onChange: (value: string) => void;
  mentions: ComposerMention[];
  onMentionsChange: (mentions: ComposerMention[]) => void;
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
const MORE = "more";
export default function AvenComposer({
  value,
  onChange,
  mentions,
  onMentionsChange,
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
    menuText = useTranslations("aven.composerMenu"),
    id = useId(),
    menuId = `${id}-menu`,
    textarea = useRef<HTMLTextAreaElement>(null),
    backdrop = useRef<HTMLDivElement>(null),
    pendingCaret = useRef<number | null>(null),
    [caret, setCaret] = useState(0),
    [dismissed, setDismissed] = useState<string | null>(null),
    [active, setActive] = useState(0),
    [helpOpen, setHelpOpen] = useState(false);
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
    if (backdrop.current) backdrop.current.scrollTop = node.scrollTop;
    if (pendingCaret.current !== null) {
      node.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);
  const trigger = consent ? findTrigger(value, caret) : null;
  const triggerKey = trigger ? `${trigger.kind}:${trigger.start}` : null;
  const open = Boolean(trigger) && dismissed !== triggerKey;
  const search = useMentionSearch(open && trigger?.kind === "mention" ? trigger.query : null);
  const options: MenuOption[] = useMemo(() => {
    if (!open || !trigger) return [];
    if (trigger.kind === "command")
      return matchCommands(trigger.query).map((command) => ({
        key: command.name,
        label: `/${command.name}`,
        detail: t(`commands.${command.name}.description`),
        badge: menuText("command"),
      }));
    return [
      ...search.items.map((item) => ({
        key: `${item.type}:${item.id}`,
        label: item.label,
        detail: item.detail,
        badge: t(`mentionTypes.${item.type}`),
      })),
      ...(search.hasMore
        ? [{ key: MORE, label: menuText("more"), detail: "", badge: "…" }]
        : []),
    ];
  }, [open, trigger, search.items, search.hasMore, t, menuText]);
  const activeIndex = options.length ? Math.min(active, options.length - 1) : -1;
  const canSend = enabled && consent && Boolean(value.trim()) && !generating;
  const segments = useMemo(() => highlightSegments(value, mentions), [value, mentions]);
  const update = (next: string, position: number) => {
    onChange(next);
    setCaret(position);
    setActive(0);
    // Drop mentions whose tokens were edited away.
    const kept = activeMentions(next, mentions);
    if (kept.length !== mentions.length) onMentionsChange(kept);
  };
  const select = (index: number) => {
    if (!trigger) return;
    const option = options[index];
    if (!option) return;
    if (option.key === MORE) {
      search.loadMore();
      return;
    }
    let text: string;
    if (trigger.kind === "command") text = `/${option.key}`;
    else {
      const item = search.items[index];
      text = mentionToken(item.label);
      onMentionsChange([
        ...activeMentions(value, mentions),
        { type: item.type, id: item.id, label: item.label },
      ]);
    }
    const next = applySelection(value, trigger, caret, text);
    pendingCaret.current = next.caret;
    onChange(next.value);
    setCaret(next.caret);
    setActive(0);
    setDismissed(null);
  };
  const send = () => {
    if (isBareHelp(value)) {
      // Answered locally: no request, no credits.
      setHelpOpen(true);
      onChange("");
      onMentionsChange([]);
      return;
    }
    if (canSend) onSubmit();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(moveActive(activeIndex, event.key === "ArrowDown" ? 1 : -1, options.length));
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && options.length && !event.shiftKey) {
        event.preventDefault();
        select(activeIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissed(triggerKey);
        return;
      }
    }
    if (event.key === "Escape" && helpOpen) setHelpOpen(false);
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
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
      {helpOpen && (
        <section className="aven-command-help" aria-labelledby={`${id}-help-title`}>
          <div className="aven-command-help-header">
            <h2 id={`${id}-help-title`}>{t("commandHelp.title")}</h2>
            <button
              type="button"
              className="aven-icon-button"
              aria-label={t("commandHelp.close")}
              onClick={() => setHelpOpen(false)}
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <ul>
            {avenCommands.map((command) => (
              <li key={command.name}>
                <code>/{command.name}</code>
                <span>{t(`commands.${command.name}.description`)}</span>
              </li>
            ))}
          </ul>
          <p>{t("commandHelp.mentions")}</p>
        </section>
      )}
      <div className="aven-composer-field">
        {open && (
          <AvenComposerMenu
            id={menuId}
            label={menuText(trigger?.kind === "command" ? "commandsLabel" : "mentionsLabel")}
            options={options}
            activeIndex={activeIndex}
            loading={trigger?.kind === "mention" && search.loading}
            error={trigger?.kind === "mention" && search.error}
            onSelect={select}
            onHover={setActive}
          />
        )}
        <label htmlFor={id} className="sr-only">
          {t("message")}
        </label>
        <div className="aven-composer-input">
          <div ref={backdrop} className="aven-composer-highlight" aria-hidden="true">
            {segments.map((segment, index) =>
              segment.kind === "text" ? (
                <span key={index}>{segment.text}</span>
              ) : (
                <mark key={index} data-kind={segment.kind} data-type={segment.type}>
                  {segment.text}
                </mark>
              ),
            )}
            {"​"}
          </div>
          <textarea
            ref={textarea}
            id={id}
            rows={1}
            value={value}
            maxLength={6000}
            disabled={!consent}
            placeholder={t(replying ? "replyPlaceholder" : "messagePlaceholder")}
            aria-describedby={`${id}-help`}
            role="combobox"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? menuId : undefined}
            aria-activedescendant={open && activeIndex >= 0 ? optionId(menuId, activeIndex) : undefined}
            onChange={(event) => update(event.target.value, event.target.selectionStart)}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onScroll={(event) => {
              if (backdrop.current) backdrop.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onBlur={() => setDismissed(triggerKey)}
            onFocus={() => setDismissed(null)}
            onKeyDown={keyDown}
          />
        </div>
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
