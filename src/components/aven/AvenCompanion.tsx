"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { featureRequest } from "@/lib/goals/client";
import type { GoalReferences } from "@/lib/goals/service";
import { Modal } from "@/components/ui/modal";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Button from "@/components/ui/button/Button";
import AvenSidebar from "./AvenSidebar";
import AvenTopBar from "./AvenTopBar";
import AvenTranscript from "./AvenTranscript";
import AvenComposer, { type AvenComposerHandle } from "./AvenComposer";
import AvenWelcome from "./AvenWelcome";
import AvenSuggestions from "./AvenSuggestions";
import AvenOnboarding from "./AvenOnboarding";
import AvenSettings from "./AvenSettings";
import AvenNotifications from "./AvenNotifications";
import { useAvenConversation } from "./useAvenConversation";
import { useAvenStream, type SendRequest } from "./useAvenStream";
import { useAvenDraft } from "./useAvenDraft";
import { useSidebar } from "@/context/SidebarContext";
import {
  errorKey,
  type AvenMessageRecord,
  type Bootstrap,
  type ConversationSummary,
} from "./types";
interface Props {
  initial: Bootstrap;
  references: GoalReferences;
  timezone: string;
  userName: string;
  goalId?: string;
  goalTitle?: string;
  intent?: string;
  notification?: string;
  conversationId?: string;
  /** Start a new conversation instead of reopening the last one in this tab. */
  fresh?: boolean;
}
type Dialog = "settings" | "notifications" | null;
export default function AvenCompanion({
  initial,
  references,
  timezone,
  userName,
  goalId,
  goalTitle,
  intent,
  notification,
  conversationId: requestedConversation,
  fresh = false,
}: Props) {
  const t = useTranslations("aven"),
    router = useRouter();
  const [bootstrap, setBootstrap] = useState(initial),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<Dialog>(null),
    [deleting, setDeleting] = useState<string>(),
    [loadingMore, setLoadingMore] = useState(false),
    [replyNotification, setReplyNotification] = useState<string>(),
    [planning, setPlanning] = useState(
      intent === "plan" || intent === "recovery" || intent === "schedule",
    ),
    [announcement, setAnnouncement] = useState("");
  const composer = useRef<AvenComposerHandle>(null);
  // Conversation history lives in the single application sidebar; its state is global.
  const { isExpanded, isMobileOpen, toggleSidebar, toggleMobileSidebar } =
    useSidebar();
  const showError = useCallback(
    (code: string) => setError(t(errorKey(t, code))),
    [t],
  );
  const conversation = useAvenConversation({
    goalId: goalId ?? null,
    goalTitle,
    onError: showError,
  });
  const {
    selected,
    messages,
    setMessages,
    proposals,
    setProposals,
    open,
    adopt,
    reload,
    reset,
    forget,
  } = conversation;
  const draft = useAvenDraft(
    initial.userId,
    intent && t.has(`prompts.${intent}`)
      ? t(`prompts.${intent}`, { title: goalTitle ?? t("myGoal") })
      : "",
  );
  const { value: input, setValue: setInput } = draft;
  const setUrl = useCallback(
    (id: string | null) => {
      // Update the address without a server navigation so switching stays instant.
      const params = new URLSearchParams();
      if (id) params.set("conversation", id);
      else if (goalId) params.set("goal", goalId);
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
      try {
        if (id) sessionStorage.setItem(`aven-selected:${initial.userId}`, id);
        else sessionStorage.removeItem(`aven-selected:${initial.userId}`);
      } catch {}
    },
    [goalId, initial.userId],
  );
  const upsertConversation = useCallback(
    (row: Pick<ConversationSummary, "id"> & Partial<ConversationSummary>) =>
      setBootstrap((current) => {
        const existing = current.conversations.find(
          (item) => item.id === row.id,
        );
        const next: ConversationSummary = {
          title: "",
          goalId: null,
          ...existing,
          ...row,
          updatedAt: new Date().toISOString(),
        };
        return {
          ...current,
          conversations: [
            next,
            ...current.conversations.filter((item) => item.id !== row.id),
          ],
        };
      }),
    [],
  );
  const stream = useAvenStream({
    setMessages,
    setProposals,
    reload,
    onAccepted: (id, text) => {
      if (!selected) {
        draft.adopt(id);
        adopt(id);
        setUrl(id);
      }
      upsertConversation(
        selected
          ? { id }
          : { id, title: text.slice(0, 80), goalId: conversation.activeGoal },
      );
    },
    onRecovered: (value) => {
      adopt(value.conversation.id);
      setUrl(value.conversation.id);
      setMessages(value.messages);
      setProposals(value.proposals);
      upsertConversation({ id: value.conversation.id });
    },
  });
  const { generating, activity, streamingKey } = stream;
  const { switchTo } = draft;
  /** Show a conversation, its draft and its address without a page navigation. */
  const show = useCallback(
    (id: string, restoring = false) => {
      open(id);
      setUrl(id);
      switchTo(id, !restoring);
    },
    [open, setUrl, switchTo],
  );
  // Initial selection: explicit link, notification reply, or the last conversation in this tab.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (notification) {
      void featureRequest<{ conversationId: string }>(
        "/api/aven/notifications",
        { id: notification, kind: "reply" },
      )
        .then((value) => {
          setReplyNotification(notification);
          show(value.conversationId, true);
        })
        .catch(() => showError("recordUnavailable"));
      return;
    }
    if (requestedConversation) return show(requestedConversation, true);
    // A prompt seeded from a goal page takes precedence over restoring earlier state.
    if (intent) return;
    if (fresh) setUrl(null);
    else if (!goalId)
      try {
        const saved = sessionStorage.getItem(`aven-selected:${initial.userId}`);
        if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return show(saved, true);
      } catch {}
    switchTo(null, false);
  }, [
    notification,
    requestedConversation,
    fresh,
    setUrl,
    intent,
    goalId,
    initial.userId,
    show,
    switchTo,
    showError,
  ]);
  // Preferences can change in another tab (e.g. consent); refresh them when the tab regains focus.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void featureRequest<Bootstrap>("/api/aven")
        .then((next) =>
          setBootstrap((current) => ({
            ...current,
            preferences: next.preferences,
            hasGoals: next.hasGoals,
          })),
        )
        .catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const preferences = bootstrap.preferences,
    ready = preferences.configured && preferences.ai.consent;
  // On phones the sidebar is a drawer: close it after choosing or starting a conversation.
  const closeOnMobile = () => {
    if (isMobileOpen) toggleMobileSidebar();
  };
  /** Explains why chat is unavailable; returns true when sending must not proceed. */
  const blocked = () => {
    if (preferences.ai.consent && preferences.configured) return false;
    showError(
      !preferences.ai.consent
        ? "aiConsentRequired"
        : (preferences.configurationError ?? "aiNotConfigured"),
    );
    return true;
  };
  const run = async (
    request: Omit<SendRequest, "conversationId" | "goalId">,
  ) => {
    if (blocked()) return;
    setError("");
    setAnnouncement("");
    const outcome = await stream.send({
      ...request,
      conversationId: selected,
      goalId: conversation.activeGoal,
    });
    if (outcome.ok) setAnnouncement(t("replyReady"));
    else if (outcome.code && outcome.code !== "generationStopped") {
      if (!outcome.accepted && !request.retryOf)
        setInput((current) => current || request.text);
      if (!outcome.accepted) showError(outcome.code);
    }
    return outcome;
  };
  const submit = (text = input, nextPlanning = planning) => {
    const value = text.trim();
    if (!value || generating || blocked()) return;
    setInput("");
    const notificationId = replyNotification;
    setReplyNotification(undefined);
    setPlanning(false);
    void run({ text: value, planning: nextPlanning, notificationId });
  };
  const sourceOf = (message: AvenMessageRecord) => {
    const requestId = message.context?.replyTo ?? message.requestId;
    return messages.find(
      (item) => item.role === "user" && item.requestId === requestId,
    );
  };
  const retry = useRef<(message: AvenMessageRecord) => void>(() => {}),
    regenerate = useRef<(message: AvenMessageRecord) => void>(() => {});
  // Stable callbacks keep memoized messages from re-rendering while a reply streams.
  useLayoutEffect(() => {
    retry.current = (message) => {
      const source = sourceOf(message);
      if (!source?.requestId) return;
      // Retry is only offered on the latest exchange, so it can safely replace any partial reply.
      void run({
        text: source.content,
        planning: false,
        retryOf: source.requestId,
        regenerate: true,
      });
    };
    regenerate.current = (message) => {
      const source = sourceOf(message);
      if (!source?.requestId) return;
      // Hide the reply being replaced; the server marks it superseded once the new reply completes.
      setMessages((current) =>
        current.map((item) =>
          item === message ? { ...item, status: "superseded" } : item,
        ),
      );
      void run({
        text: source.content,
        planning: false,
        retryOf: source.requestId,
        regenerate: true,
      }).then((outcome) => {
        if (!outcome?.ok && selected) void reload(selected).catch(() => {});
      });
    };
  });
  const onRetry = useCallback(
    (message: AvenMessageRecord) => retry.current(message),
    [],
  );
  const onRegenerate = useCallback(
    (message: AvenMessageRecord) => regenerate.current(message),
    [],
  );
  const onAsk = useCallback((notificationId: string) => {
    setReplyNotification(notificationId);
    composer.current?.focus();
  }, []);
  const onModify = useCallback(
    (prompt: string) => {
      setInput(prompt);
      requestAnimationFrame(() => composer.current?.focus());
    },
    [setInput],
  );
  const onProposalResolved = useCallback(
    (result?: { goalId?: string } | null) => {
      if (selected) void reload(selected).catch(() => {});
      if (result?.goalId)
        setBootstrap((current) => ({ ...current, hasGoals: true }));
      router.refresh();
    },
    [selected, reload, router],
  );
  const startNew = () => {
    if (generating) return;
    reset();
    setUrl(null);
    switchTo(null);
    setReplyNotification(undefined);
    setError("");
    closeOnMobile();
    requestAnimationFrame(() => composer.current?.focus());
  };
  const select = (id: string) => {
    if (generating) return;
    setError("");
    setReplyNotification(undefined);
    if (id !== selected) show(id);
    closeOnMobile();
  };
  const rename = async (id: string, title: string) => {
    try {
      await featureRequest("/api/aven", {
        kind: "renameConversation",
        id,
        title,
      });
      setBootstrap((current) => ({
        ...current,
        conversations: current.conversations.map((item) =>
          item.id === id ? { ...item, title } : item,
        ),
      }));
      return true;
    } catch (failure) {
      showError((failure as Error).message);
      return false;
    }
  };
  const loadMore = () => {
    const cursor = bootstrap.conversations.at(-1)?.id;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void featureRequest<
      Pick<Bootstrap, "conversations" | "hasMoreConversations">
    >(`/api/aven?history=true&before=${cursor}`)
      .then((value) =>
        setBootstrap((current) => ({
          ...current,
          hasMoreConversations: value.hasMoreConversations,
          conversations: [
            ...current.conversations,
            ...value.conversations.filter(
              (row) =>
                !current.conversations.some((item) => item.id === row.id),
            ),
          ],
        })),
      )
      .catch(() => showError("historyRefreshFailed"))
      .finally(() => setLoadingMore(false));
  };
  const openSettings = () => {
    setDialog("settings");
    // Usage and budget figures change with every reply; fetch them when the panel opens.
    void featureRequest<Bootstrap>("/api/aven")
      .then((next) =>
        setBootstrap((current) => ({
          ...current,
          preferences: next.preferences,
        })),
      )
      .catch(() => {});
  };
  const empty = !selected && !messages.length;
  const title = selected
    ? (bootstrap.conversations.find((item) => item.id === selected)?.title ??
      t("title"))
    : t("newConversation");
  const notice = !preferences.configured ? (
    <p role="status" className="aven-notice" data-tone="warning">
      {t(`errors.${preferences.configurationError ?? "aiNotConfigured"}`)}
    </p>
  ) : !preferences.ai.consent && preferences.ai.onboardingComplete ? (
    <div role="status" className="aven-notice">
      <p>{t("privacyPaused")}</p>
      <Button size="sm" variant="outline" onClick={openSettings}>
        {t("openSettings")}
      </Button>
    </div>
  ) : null;
  return (
    <div className="aven-workspace">
      <AvenSidebar
        conversations={bootstrap.conversations}
        hasMore={bootstrap.hasMoreConversations}
        loadingMore={loadingMore}
        selected={selected}
        disabled={generating}
        timezone={timezone}
        onNew={startNew}
        onSelect={select}
        onRename={rename}
        onDelete={setDeleting}
        onLoadMore={loadMore}
      />
      <section className="aven-main" aria-label={t("title")}>
        <AvenTopBar
          title={title}
          goalTitle={conversation.contextTitle}
          sidebarOpen={isMobileOpen || isExpanded}
          disabled={generating}
          onToggleSidebar={() => {
            // Phones open the drawer; desktop expands or collapses the shared sidebar.
            if (matchMedia("(min-width: 1024px)").matches) toggleSidebar();
            else toggleMobileSidebar();
          }}
          onNew={startNew}
          onNotifications={() => setDialog("notifications")}
          onSettings={openSettings}
        />
        {empty ? (
          <AvenWelcome name={userName} timezone={timezone}>
            {notice}
          </AvenWelcome>
        ) : (
          <AvenTranscript
            conversationKey={selected ?? "new"}
            messages={messages}
            proposals={proposals}
            references={references}
            timezone={timezone}
            loading={conversation.loading}
            generating={generating}
            streamingKey={streamingKey}
            activity={activity}
            hasOlder={conversation.hasOlder}
            loadingOlder={conversation.loadingOlder}
            onLoadOlder={() => {
              void conversation.loadOlder();
            }}
            onRetry={onRetry}
            onRegenerate={onRegenerate}
            onAsk={onAsk}
            onProposalResolved={onProposalResolved}
            onModify={onModify}
          />
        )}
        <div className="aven-dock" data-empty={empty || undefined}>
          <div className="aven-column">
            {!empty && notice}
            {error && (
              <p role="alert" className="aven-notice" data-tone="error">
                {error}
              </p>
            )}
            <AvenComposer
              ref={composer}
              value={input}
              onChange={setInput}
              onSubmit={() => submit()}
              onStop={stream.stop}
              generating={generating}
              enabled={ready && !conversation.loading}
              consent={preferences.ai.consent}
              replying={Boolean(replyNotification)}
              onCancelReply={() => setReplyNotification(undefined)}
            />
          </div>
        </div>
        {empty && (
          <div className="aven-welcome-tail">
            <div className="aven-column">
              {preferences.ai.onboardingComplete ? (
                <AvenSuggestions
                  hasGoals={bootstrap.hasGoals}
                  disabled={!ready || generating}
                  onPick={(prompt, nextPlanning) =>
                    submit(prompt, nextPlanning)
                  }
                />
              ) : (
                <AvenOnboarding
                  preferences={preferences}
                  onDone={(next) =>
                    setBootstrap((current) => ({
                      ...current,
                      preferences: next,
                    }))
                  }
                />
              )}
            </div>
          </div>
        )}
        {/* Announces activity and completion, never individual streamed tokens. */}
        <p role="status" aria-live="polite" className="sr-only">
          {activity && generating ? t(`activity.${activity}`) : announcement}
        </p>
      </section>
      <Modal
        isOpen={dialog === "notifications"}
        onClose={() => setDialog(null)}
        title={t("notificationCenter")}
        size="wide"
      >
        {dialog === "notifications" && (
          <AvenNotifications
            timezone={timezone}
            onReply={(conversationId, notificationId) => {
              setDialog(null);
              setReplyNotification(notificationId);
              forget(conversationId);
              show(conversationId);
              requestAnimationFrame(() => composer.current?.focus());
            }}
          />
        )}
      </Modal>
      <Modal
        isOpen={dialog === "settings"}
        onClose={() => setDialog(null)}
        title={t("settings")}
        size="wide"
      >
        {dialog === "settings" && (
          <AvenSettings
            initial={preferences}
            onSaved={(next) =>
              setBootstrap((current) => ({ ...current, preferences: next }))
            }
          />
        )}
      </Modal>
      <ConfirmDialog
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("deleteConversation")}
        description={t("deleteConversationHelp")}
        onConfirm={async () => {
          if (!deleting) return false;
          try {
            await featureRequest("/api/aven", {
              kind: "deleteConversation",
              id: deleting,
            });
            forget(deleting);
            if (selected === deleting) startNew();
            setBootstrap((current) => ({
              ...current,
              conversations: current.conversations.filter(
                (item) => item.id !== deleting,
              ),
            }));
            setDeleting(undefined);
            return true;
          } catch {
            showError("serviceUnavailable");
            return false;
          }
        }}
      />
    </div>
  );
}
