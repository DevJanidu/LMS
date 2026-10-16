"use client";
import {
  useCallback,
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
import { useRouter } from "@/i18n/navigation";
import { ArrowUpIcon, CloseIcon, MicIcon, StopIcon } from "@/icons";
import { avenCommands, type MentionType } from "@/lib/aven/commands";
import {
  availabilityOf,
  filterItems,
  slashItems,
  type ComposerAction,
  type ComposerEnvironment,
  type ComposerItem,
} from "@/lib/aven/composer-registry";
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
import ComposerMenu, { rowId, type MenuRow } from "./composer/ComposerMenu";
import { mentionIcon } from "./composer/ComposerIcon";
import PlusMenu, { type SubjectChoice } from "./composer/PlusMenu";
import AttachmentList from "./composer/AttachmentList";
import { acceptedTypes, useAttachments } from "./composer/useAttachments";
import { useDictation } from "./composer/useDictation";
import { useMenuPlacement } from "./composer/useMenuPlacement";
export interface AvenComposerHandle {
  focus: () => void;
}
interface Props {
  value: string;
  onChange: (value: string) => void;
  mentions: ComposerMention[];
  onMentionsChange: (mentions: ComposerMention[]) => void;
  /** Attached library resources go with the message as structured references. */
  onSubmit: (attachments: { type: "resource"; id: string }[]) => void;
  onStop: () => void;
  generating: boolean;
  enabled: boolean;
  consent: boolean;
  /** Whether Aven may read resource contents (Aven settings). */
  canReadContent?: boolean;
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
  canReadContent = false,
  replying,
  onCancelReply,
  ref,
}: Props) {
  const t = useTranslations("aven"),
    menuText = useTranslations("aven.composerMenu"),
    itemText = useTranslations("aven.composerItems"),
    router = useRouter(),
    id = useId(),
    menuId = `${id}-menu`,
    textarea = useRef<HTMLTextAreaElement>(null),
    backdrop = useRef<HTMLDivElement>(null),
    field = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    pendingCaret = useRef<number | null>(null),
    uploadSubject = useRef<string>(""),
    [caret, setCaret] = useState(0),
    [dismissed, setDismissed] = useState<string | null>(null),
    [active, setActive] = useState(0),
    [slashParent, setSlashParent] = useState<string | null>(null),
    [mentionFilter, setMentionFilter] = useState<MentionType[]>([]),
    [helpOpen, setHelpOpen] = useState(false);
  const attachments = useAttachments();
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
      node.focus();
      node.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value]);
  /** Inserts text at the caret with sensible spacing and keeps the caret after it. */
  const insertAtCaret = useCallback(
    (text: string) => {
      const before = value.slice(0, caret),
        after = value.slice(caret);
      const lead = before && !/\s$/.test(before) ? " " : "";
      const next = `${before}${lead}${text}${after && !/^\s/.test(after) ? " " : ""}${after}`;
      const position = before.length + lead.length + text.length;
      pendingCaret.current = position;
      onChange(next);
      setCaret(position);
    },
    [caret, onChange, value],
  );
  const dictation = useDictation(useCallback((text: string) => insertAtCaret(`${text} `), [insertAtCaret]));
  const env: ComposerEnvironment = {
    speech: dictation.supported,
    uploads: consent && enabled && !generating,
  };
  const trigger = consent ? findTrigger(value, caret) : null;
  const triggerKey = trigger ? `${trigger.kind}:${trigger.start}` : null;
  const open = Boolean(trigger) && dismissed !== triggerKey;
  const placement = useMenuPlacement(field, open);
  const search = useMentionSearch(
    open && trigger?.kind === "mention" ? trigger.query : null,
    mentionFilter,
  );
  const slashList: ComposerItem[] = useMemo(() => {
    if (!open || trigger?.kind !== "command") return [];
    const parent = slashParent ? slashItems.find((item) => item.id === slashParent) : undefined;
    return parent?.children ?? filterItems(slashItems, trigger.query, (key) => itemText(`${key}.label`));
  }, [open, trigger, slashParent, itemText]);
  const rows: MenuRow[] = useMemo(() => {
    if (!open || !trigger) return [];
    if (trigger.kind === "command")
      return slashList.map((item) => {
        const availability = availabilityOf(item, env);
        return {
          key: item.id,
          icon: item.icon,
          label: itemText(`${item.id}.label`),
          description: availability.available
            ? itemText(`${item.id}.description`)
            : itemText(`reasons.${availability.reason}`),
          disabled: !availability.available,
          submenu: Boolean(item.children),
        };
      });
    return [
      ...search.items.map((item) => ({
        key: `${item.type}:${item.id}`,
        icon: mentionIcon[item.type],
        label: item.label,
        description: item.detail,
        badge: t(`mentionTypes.${item.type}`),
      })),
      ...(search.hasMore
        ? [{ key: MORE, icon: "plus" as const, label: menuText("more"), description: "" }]
        : []),
    ];
    // env is derived each render from stable flags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trigger, slashList, search.items, search.hasMore, t, menuText, itemText, env.speech, env.uploads]);
  const activeIndex = rows.length ? Math.min(active, rows.length - 1) : -1;
  const ready = attachments.items.filter((item) => item.status === "ready" && item.resourceId);
  const canSend =
    enabled && consent && !generating && !attachments.busy && (Boolean(value.trim()) || ready.length > 0);
  const segments = useMemo(() => highlightSegments(value, mentions), [value, mentions]);
  const closeMenus = () => {
    setActive(0);
    setSlashParent(null);
    setMentionFilter([]);
    setDismissed(null);
  };
  const update = (next: string, position: number) => {
    onChange(next);
    setCaret(position);
    setActive(0);
    if (!findTrigger(next, position)) {
      setSlashParent(null);
      setMentionFilter([]);
    }
    // Drop mentions whose tokens were edited away.
    const kept = activeMentions(next, mentions);
    if (kept.length !== mentions.length) onMentionsChange(kept);
  };
  /** Replace the "/query" with new text (or nothing) and keep the rest of the message. */
  const replaceTrigger = (text: string) => {
    if (!trigger) return;
    const next = text
      ? applySelection(value, trigger, caret, text)
      : { value: value.slice(0, trigger.start) + value.slice(caret), caret: trigger.start };
    pendingCaret.current = next.caret;
    onChange(next.value);
    setCaret(next.caret);
  };
  const run = (action: ComposerAction, subjectId?: string) => {
    switch (action.type) {
      case "command":
        if (action.command === "help") {
          // Answered locally: no request, no credits.
          replaceTrigger("");
          setHelpOpen(true);
        } else {
          const text = `/${action.command}${action.text ? ` ${action.text.trimEnd()}` : ""}`;
          if (trigger?.kind === "command") replaceTrigger(text);
          else insertAtCaret(`${text} `);
        }
        break;
      case "dictate":
        replaceTrigger("");
        dictation.start();
        break;
      case "navigate":
        replaceTrigger("");
        router.push(action.href);
        break;
      case "attachFiles":
        if (trigger?.kind === "command") replaceTrigger("");
        uploadSubject.current = subjectId ?? "";
        fileInput.current?.click();
        break;
      case "pickLibrary":
        // Reuses the mention picker, limited to library resources.
        setMentionFilter(["resource"]);
        if (trigger?.kind === "command") replaceTrigger("@");
        else insertAtCaret("@");
        break;
    }
  };
  const select = (index: number) => {
    if (!trigger) return;
    const row = rows[index];
    if (!row || row.disabled) return;
    if (trigger.kind === "command") {
      const item = slashList[index];
      if (item.children) {
        setSlashParent(item.id);
        setActive(0);
        return;
      }
      if (item.action) run(item.action);
      setActive(0);
      setSlashParent(null);
      return;
    }
    if (row.key === MORE) {
      search.loadMore();
      return;
    }
    const item = search.items[index];
    onMentionsChange([...activeMentions(value, mentions), { type: item.type, id: item.id, label: item.label }]);
    replaceTrigger(mentionToken(item.label));
    closeMenus();
  };
  const send = () => {
    if (isBareHelp(value) && !ready.length) {
      setHelpOpen(true);
      onChange("");
      onMentionsChange([]);
      return;
    }
    if (!canSend) return;
    onSubmit(ready.map((item) => ({ type: "resource" as const, id: item.resourceId! })));
    attachments.clear();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    send();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME composition owns the keyboard until it commits.
    if (event.nativeEvent.isComposing) return;
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive(moveActive(activeIndex, event.key === "ArrowDown" ? 1 : -1, rows.length));
        return;
      }
      if (event.key === "ArrowRight" && rows[activeIndex]?.submenu && caret === value.length) {
        event.preventDefault();
        select(activeIndex);
        return;
      }
      if (event.key === "ArrowLeft" && slashParent) {
        event.preventDefault();
        setSlashParent(null);
        setActive(0);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && rows.length && !event.shiftKey) {
        event.preventDefault();
        select(activeIndex);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (slashParent) {
          setSlashParent(null);
          setActive(0);
        } else {
          setDismissed(triggerKey);
          setMentionFilter([]);
        }
        return;
      }
    }
    if (event.key === "Escape" && helpOpen) setHelpOpen(false);
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };
  const loadSubjects = async (): Promise<SubjectChoice[]> => {
    // A subject already mentioned in the message is the natural home for the file.
    const mentioned = activeMentions(value, mentions).filter((item) => item.type === "subject");
    if (mentioned.length === 1) return [{ id: mentioned[0].id, label: mentioned[0].label }];
    const response = await fetch("/api/aven/mentions?types=subject", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error);
    return (result.items as { id: string; label: string }[]).map((item) => ({ id: item.id, label: item.label }));
  };
  const parentItem = slashParent ? slashItems.find((item) => item.id === slashParent) : undefined;
  const status =
    trigger?.kind === "mention"
      ? search.loading
        ? menuText("searching")
        : search.error
          ? menuText("error")
          : !rows.length
            ? menuText("empty")
            : undefined
      : !rows.length
        ? itemText("noCommands")
        : undefined;
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
      <AttachmentList
        items={attachments.items}
        canReadContent={canReadContent}
        onRemove={attachments.remove}
        onRetry={(key) => attachments.retry(key)}
      />
      <div ref={field} className="aven-composer-field">
        {open && (
          <ComposerMenu
            id={menuId}
            label={trigger?.kind === "command" ? itemText("commandsLabel") : menuText("mentionsLabel")}
            role="listbox"
            rows={rows}
            activeIndex={activeIndex}
            side={placement.side}
            maxHeight={placement.maxHeight}
            status={status}
            parent={
              parentItem
                ? {
                    label: itemText(`${parentItem.id}.label`),
                    onBack: () => {
                      setSlashParent(null);
                      setActive(0);
                    },
                  }
                : undefined
            }
            onSelect={select}
            onHover={setActive}
          />
        )}
        <PlusMenu
          env={env}
          disabled={!consent || !enabled}
          anchor={field}
          loadSubjects={loadSubjects}
          onAction={run}
        />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          accept={acceptedTypes}
          onChange={(event) => {
            if (event.target.files?.length && uploadSubject.current)
              attachments.add(event.target.files, uploadSubject.current);
            event.target.value = "";
          }}
        />
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
            aria-activedescendant={open && activeIndex >= 0 ? rowId(menuId, activeIndex) : undefined}
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
        {dictation.listening && (
          <button
            type="button"
            className="aven-icon-button aven-dictation"
            aria-label={t("dictation.stop")}
            title={t("dictation.stop")}
            onClick={dictation.stop}
          >
            <MicIcon className="size-4" />
            <span className="sr-only" role="status">
              {t("dictation.listening")}
            </span>
          </button>
        )}
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
      <p id={`${id}-help`} className="aven-composer-help" role={dictation.failed ? "alert" : undefined}>
        {dictation.failed ? t("dictation.error") : t(consent ? "composerHelp" : "consentRequired")}
      </p>
    </form>
  );
}
