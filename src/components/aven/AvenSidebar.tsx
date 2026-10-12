"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon, PlusIcon, SearchIcon, SparklesIcon } from "@/icons";
import { featureRequest } from "@/lib/goals/client";
import { useLocalStorage } from "@/hooks/useBrowserState";
import AvenConversationGroup from "./AvenConversationGroup";
import type { ConversationSummary } from "./types";
interface Props {
  conversations: ConversationSummary[];
  hasMore: boolean;
  loadingMore: boolean;
  selected: string | null;
  disabled: boolean;
  open: boolean;
  collapsed: boolean;
  timezone: string;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onLoadMore: () => void;
}
const groupOrder = ["today", "yesterday", "week", "older"] as const;
type Group = (typeof groupOrder)[number];
/** Groups by calendar day in the account time zone so server and browser agree. */
function grouper(timezone: string) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const day = (date: Date) => Date.parse(format.format(date));
  const today = day(new Date());
  return (updatedAt: string): Group => {
    const age = Math.round((today - day(new Date(updatedAt))) / 86400000);
    return age <= 0
      ? "today"
      : age === 1
        ? "yesterday"
        : age <= 7
          ? "week"
          : "older";
  };
}
export default function AvenSidebar({
  conversations,
  hasMore,
  loadingMore,
  selected,
  disabled,
  open,
  collapsed,
  timezone,
  onClose,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onLoadMore,
}: Props) {
  const t = useTranslations("aven"),
    searchId = useId(),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState<{
      rows: ConversationSummary[] | null;
      failed: boolean;
    }>({ rows: null, failed: false }),
    [stored, store] = useLocalStorage("aven-history-collapsed");
  const closedGroups = useMemo<Group[]>(() => {
    try {
      const saved: unknown = JSON.parse(stored ?? "[]");
      return Array.isArray(saved)
        ? saved.filter((item): item is Group => groupOrder.includes(item))
        : [];
    } catch {
      return [];
    }
  }, [stored]);
  const toggleGroup = (group: Group) =>
    store(
      JSON.stringify(
        closedGroups.includes(group)
          ? closedGroups.filter((item) => item !== group)
          : [...closedGroups, group],
      ),
    );
  const term = query.trim().slice(0, 80);
  const results = term ? search.rows : null,
    searchError = Boolean(term) && search.failed;
  // Search titles on the server so older, unloaded conversations are found too; rerun after renames or deletions.
  const revision = conversations.map((item) => item.id + item.title).join("|");
  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void featureRequest<{ conversations: ConversationSummary[] }>(
        `/api/aven?history=true&q=${encodeURIComponent(term)}`,
        undefined,
        controller.signal,
      )
        .then((value) =>
          setSearch({ rows: value.conversations, failed: false }),
        )
        .catch(() => {
          if (!controller.signal.aborted)
            setSearch({ rows: null, failed: true });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, revision]);
  const groups = useMemo(() => {
    const groupOf = grouper(timezone),
      map = new Map<Group, ConversationSummary[]>();
    for (const conversation of conversations) {
      const group = groupOf(conversation.updatedAt);
      map.set(group, [...(map.get(group) ?? []), conversation]);
    }
    return groupOrder
      .filter((group) => map.has(group))
      .map((group) => ({ group, rows: map.get(group)! }));
  }, [conversations, timezone]);
  const rowProps = {
    selected,
    disabled,
    onSelect,
    onRename,
    onDelete,
  };
  return (
    <aside
      id="aven-sidebar"
      aria-label={t("conversations")}
      className="aven-sidebar"
      data-open={open || undefined}
      data-collapsed={collapsed || undefined}
    >
      <div className="aven-sidebar-head">
        <div className="aven-identity">
          <span className="aven-identity-mark">
            <SparklesIcon className="size-4" />
          </span>
          <span>{t("title")}</span>
        </div>
        <button
          type="button"
          className="aven-icon-button aven-mobile-only"
          aria-label={t("hideConversations")}
          onClick={onClose}
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      <button
        type="button"
        className="aven-new-chat"
        disabled={disabled}
        onClick={onNew}
      >
        <PlusIcon className="size-4" />
        {t("newConversation")}
      </button>
      <div className="aven-search">
        <label htmlFor={searchId} className="sr-only">
          {t("searchConversations")}
        </label>
        <SearchIcon className="size-4" aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          value={query}
          maxLength={80}
          placeholder={t("searchConversations")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <nav
        className="aven-history custom-scrollbar"
        aria-label={t("conversations")}
      >
        {results ? (
          <AvenConversationGroup
            label={t("searchResults")}
            rows={results}
            {...rowProps}
          />
        ) : (
          groups.map(({ group, rows }) => (
            <AvenConversationGroup
              key={group}
              label={t(`historyGroups.${group}`)}
              rows={rows}
              collapsed={closedGroups.includes(group)}
              onToggle={() => toggleGroup(group)}
              {...rowProps}
            />
          ))
        )}
        {searchError && (
          <p className="aven-history-empty">{t("errors.serviceUnavailable")}</p>
        )}
        {results && !results.length && (
          <p className="aven-history-empty">{t("noSearchResults")}</p>
        )}
        {!results && !conversations.length && (
          <p className="aven-history-empty">{t("noConversations")}</p>
        )}
        {!results && hasMore && (
          <button
            type="button"
            className="aven-text-button w-full justify-center"
            disabled={loadingMore}
            onClick={onLoadMore}
          >
            {t("loadMoreConversations")}
          </button>
        )}
      </nav>
      <p className="aven-sidebar-foot">{t("privacyShort")}</p>
    </aside>
  );
}
