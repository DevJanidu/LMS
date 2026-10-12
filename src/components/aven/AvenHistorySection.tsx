"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSidebar } from "@/context/SidebarContext";
import { featureRequest } from "@/lib/goals/client";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import AvenSidebar from "./AvenSidebar";
import type { ConversationSummary } from "./types";
interface History {
  userId: string;
  conversations: ConversationSummary[];
  hasMoreConversations: boolean;
}
// Survives client navigation so moving between pages shows history instantly.
let cache: History | null = null;
interface Props {
  userId: string;
  timezone: string;
}
/**
 * Aven conversation history in the application sidebar on pages other than Aven.
 * Opening a conversation navigates to Aven; the Aven page renders its own live section.
 */
export default function AvenHistorySection({ userId, timezone }: Props) {
  const t = useTranslations("aven"),
    router = useRouter(),
    { isExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar();
  const [history, setHistory] = useState<History | null>(() =>
    cache?.userId === userId ? cache : null,
  );
  const [loaded, setLoaded] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [deleting, setDeleting] = useState<string>();
  const update = useCallback((next: History) => {
    cache = next;
    setHistory(next);
  }, []);
  // Fetch only once the section is visible (expanded sidebar or open mobile drawer).
  const visible = isExpanded || isMobileOpen;
  useEffect(() => {
    if (!visible || loaded) return;
    const controller = new AbortController();
    void featureRequest<Omit<History, "userId">>(
      "/api/aven?history=true",
      undefined,
      controller.signal,
    )
      .then((value) => {
        update({ userId, ...value });
        setLoaded(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [visible, loaded, userId, update]);
  const leave = (href: string) => {
    if (isMobileOpen) toggleMobileSidebar();
    router.push(href);
  };
  const rows = history?.conversations ?? [];
  return (
    <>
      <AvenSidebar
        conversations={rows}
        hasMore={history?.hasMoreConversations ?? false}
        loadingMore={loadingMore}
        selected={null}
        disabled={false}
        timezone={timezone}
        onNew={() => leave("/aven?new=1")}
        onSelect={(id) => leave(`/aven?conversation=${id}`)}
        onRename={async (id, title) => {
          try {
            await featureRequest("/api/aven", {
              kind: "renameConversation",
              id,
              title,
            });
            if (history)
              update({
                ...history,
                conversations: rows.map((row) =>
                  row.id === id ? { ...row, title } : row,
                ),
              });
            return true;
          } catch {
            return false;
          }
        }}
        onDelete={setDeleting}
        onLoadMore={() => {
          const cursor = rows.at(-1)?.id;
          if (!cursor || loadingMore || !history) return;
          setLoadingMore(true);
          void featureRequest<Omit<History, "userId">>(
            `/api/aven?history=true&before=${cursor}`,
          )
            .then((value) =>
              update({
                ...history,
                hasMoreConversations: value.hasMoreConversations,
                conversations: [
                  ...rows,
                  ...value.conversations.filter(
                    (row) => !rows.some((item) => item.id === row.id),
                  ),
                ],
              }),
            )
            .catch(() => {})
            .finally(() => setLoadingMore(false));
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("deleteConversation")}
        description={t("deleteConversationHelp")}
        onConfirm={async () => {
          if (!deleting || !history) return false;
          try {
            await featureRequest("/api/aven", {
              kind: "deleteConversation",
              id: deleting,
            });
            // Aven reopens the last conversation of this tab; forget it if it was deleted.
            try {
              if (
                sessionStorage.getItem(`aven-selected:${userId}`) === deleting
              )
                sessionStorage.removeItem(`aven-selected:${userId}`);
            } catch {}
            update({
              ...history,
              conversations: rows.filter((row) => row.id !== deleting),
            });
            setDeleting(undefined);
            return true;
          } catch {
            return false;
          }
        }}
      />
    </>
  );
}
