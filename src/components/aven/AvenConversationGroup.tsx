"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDownIcon, EditIcon, TrashIcon } from "@/icons";
import type { ConversationSummary } from "./types";
interface Props {
  label: string;
  rows: ConversationSummary[];
  collapsed?: boolean;
  onToggle?: () => void;
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => void;
}
export default function AvenConversationGroup({
  label,
  rows,
  collapsed = false,
  onToggle,
  ...row
}: Props) {
  return (
    <section className="aven-history-group">
      {onToggle ? (
        <button
          type="button"
          className="aven-history-label"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          {label}
          <ChevronDownIcon className="size-3.5" />
        </button>
      ) : (
        <p className="aven-history-label">{label}</p>
      )}
      {!collapsed && (
        <ul>
          {rows.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              {...row}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
function ConversationRow({
  conversation,
  selected,
  disabled,
  onSelect,
  onRename,
  onDelete,
}: Omit<Props, "label" | "rows" | "collapsed" | "onToggle"> & {
  conversation: ConversationSummary;
}) {
  const t = useTranslations("aven"),
    [editing, setEditing] = useState(false),
    [title, setTitle] = useState(conversation.title),
    [saving, setSaving] = useState(false);
  const save = async () => {
    const value = title.trim();
    if (!value || value === conversation.title) {
      setTitle(conversation.title);
      setEditing(false);
      return;
    }
    setSaving(true);
    const saved = await onRename(conversation.id, value);
    setSaving(false);
    if (saved) setEditing(false);
  };
  if (editing)
    return (
      <li className="aven-history-row" data-editing>
        <input
          autoFocus
          aria-label={t("renameConversation")}
          value={title}
          maxLength={80}
          disabled={saving}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            void save();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
            if (event.key === "Escape") {
              setTitle(conversation.title);
              setEditing(false);
            }
          }}
        />
      </li>
    );
  return (
    <li
      className="aven-history-row"
      aria-current={selected === conversation.id ? "page" : undefined}
    >
      <button
        type="button"
        className="aven-history-link"
        disabled={disabled}
        title={conversation.title}
        onClick={() => onSelect(conversation.id)}
      >
        {conversation.title}
      </button>
      <span className="aven-history-tools">
        <button
          type="button"
          className="aven-icon-button"
          aria-label={t("renameConversationNamed", {
            title: conversation.title,
          })}
          disabled={disabled}
          onClick={() => {
            setTitle(conversation.title);
            setEditing(true);
          }}
        >
          <EditIcon className="size-3.5" />
        </button>
        <button
          type="button"
          className="aven-icon-button"
          data-tone="danger"
          aria-label={t("deleteConversationNamed", {
            title: conversation.title,
          })}
          disabled={disabled}
          onClick={() => onDelete(conversation.id)}
        >
          <TrashIcon className="size-3.5" />
        </button>
      </span>
    </li>
  );
}
