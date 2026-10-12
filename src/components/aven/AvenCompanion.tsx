"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CommandIcon, ListIcon, EditIcon, BellIcon } from "@/icons";
import { useRouter } from "@/i18n/navigation";
import { featureRequest } from "@/lib/goals/client";
import { responseEvents } from "@/lib/aven/stream";
import type { avenBootstrap } from "@/lib/aven/conversations";
import type { GoalReferences } from "@/lib/goals/service";
import AvenConversationSidebar from "./AvenConversationSidebar";
import AvenComposer from "./AvenComposer";
import AvenNavigation from "./AvenNavigation";
import AvenActivity from "./AvenActivity";
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import AvenMarkdown from "./AvenMarkdown";
import AvenSettings from "./AvenSettings";
import AvenOnboarding from "./AvenOnboarding";
import AvenNotifications from "./AvenNotifications";
import ProposalCard, { type ProposalRecord } from "./ProposalCard";
type Bootstrap = Awaited<ReturnType<typeof avenBootstrap>>;
interface Message {
  id: string;
  role: string;
  content: string;
  status: string;
  requestId?: string;
  createdAt?: string;
  context?: Record<string, string> | null;
}
interface ConversationResult {
  hasOlder: boolean;
  conversation: {
    id: string;
    goalId: string | null;
    goalTitle: string | null;
    summary: string;
  };
  messages: Message[];
  proposals: ProposalRecord[];
}
interface Props {
  initial: Bootstrap;
  references: GoalReferences;
  timezone: string;
  goalId?: string;
  goalTitle?: string;
  intent?: string;
  notification?: string;
  conversationId?: string;
}
export default function AvenCompanion({
  initial,
  references,
  timezone,
  goalId,
  goalTitle,
  intent,
  notification,
  conversationId: requestedConversation,
}: Props) {
  const t = useTranslations("aven"),
    router = useRouter();
  const [replyNotification, setReplyNotification] = useState(notification);
  const [bootstrap, setBootstrap] = useState(initial),
    [tab, setTab] = useState<"chat" | "settings" | "notifications">("chat"),
    [selected, setSelected] = useState<string | null>(
      requestedConversation ?? null,
    ),
    [activeGoal, setActiveGoal] = useState(goalId ?? null),
    [messages, setMessages] = useState<Message[]>([]),
    [proposals, setProposals] = useState<ProposalRecord[]>([]),
    [input, setInput] = useState(
      intent && t.has(`prompts.${intent}`)
        ? t(`prompts.${intent}`, { title: goalTitle ?? t("myGoal") })
        : "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<string>(),
    [lastMessage, setLastMessage] = useState("");
  const [generating, setGenerating] = useState(false),
    [actionBusy, setActionBusy] = useState(false),
    [activity, setActivity] = useState<string>(),
    [notificationRevision, setNotificationRevision] = useState(0);
  const restored = useRef(false),
    stopped = useRef(false);
  const lastAttempt = useRef<{
    message: string;
    requestId: string;
    originalRequestId: string;
    conversationId: string | null;
    accepted: boolean;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (requestedConversation || intent || goalId) return;
    try {
      const saved = sessionStorage.getItem("aven-selected:" + initial.userId);
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) setSelected(saved);
    } catch {}
  }, [initial, requestedConversation, intent, goalId]);
  useEffect(() => {
    if (selected)
      try {
        sessionStorage.setItem("aven-selected:" + initial.userId, selected);
      } catch {}
  }, [selected, initial.userId]);
  const [planning, setPlanning] = useState(
    intent === "plan" || intent === "recovery" || intent === "schedule",
  );
  const [contextTitle, setContextTitle] = useState(goalTitle),
    [hasOlder, setHasOlder] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chatScroll = useRef<HTMLDivElement>(null),
    followLatest = useRef(true);
  useEffect(() => {
    try {
      setSidebarOpen(localStorage.getItem("aven-conversations") === "open");
    } catch {}
  }, []);
  const toggleSidebar = (open: boolean) => {
    setSidebarOpen(open);
    try {
      localStorage.setItem("aven-conversations", open ? "open" : "closed");
    } catch {}
  };
  const sending = useRef(false),
    abort = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (!notification) return;
    let live = true;
    void featureRequest<{ conversationId: string }>("/api/aven/notifications", {
      id: notification,
      kind: "reply",
    })
      .then((value) => {
        if (!live) return;
        setSelected(value.conversationId);
        setReplyNotification(notification);
        setTab("chat");
        setNotificationRevision((value) => value + 1);
      })
      .catch(() => {
        if (live) setError(t("errors.recordUnavailable"));
      });
    return () => {
      live = false;
    };
  }, [notification, requestedConversation, t]);
  useEffect(() => {
    if (followLatest.current && chatScroll.current)
      chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [messages, proposals]);
  useEffect(() => {
    if (!selected || sending.current) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    void featureRequest<ConversationResult>(
      `/api/aven?conversation=${selected}`,
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        setHasOlder(value.hasOlder);
        setMessages(value.messages);
        setProposals(value.proposals);
        setActiveGoal(value.conversation.goalId);
        setContextTitle(value.conversation.goalTitle ?? undefined);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            t.has(`errors.${error.message}`)
              ? t(`errors.${error.message}`)
              : t("errors.serviceUnavailable"),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [selected, notificationRevision, t]);
  useEffect(() => {
    const refreshPreferences = () => {
      if (document.visibilityState !== "visible") return;
      void featureRequest<Bootstrap>("/api/aven")
        .then((next) =>
          setBootstrap((current) => ({
            ...current,
            preferences: next.preferences,
          })),
        )
        .catch(() => {});
    };
    window.addEventListener("focus", refreshPreferences);
    document.addEventListener("visibilitychange", refreshPreferences);
    return () => {
      window.removeEventListener("focus", refreshPreferences);
      document.removeEventListener("visibilitychange", refreshPreferences);
    };
  }, []);
  const reload = async (id: string) => {
    const [conversation, next] = await Promise.all([
      featureRequest<ConversationResult>(`/api/aven?conversation=${id}`),
      featureRequest<Bootstrap>("/api/aven"),
    ]);
    setHasOlder(conversation.hasOlder);
    setContextTitle(conversation.conversation.goalTitle ?? undefined);
    setMessages(conversation.messages);
    setProposals(conversation.proposals);
    setBootstrap(next);
  };
  const loadOlder = async () => {
    if (!selected || busy || generating || !messages[0]) return;
    setBusy(true);
    try {
      const older = await featureRequest<ConversationResult>(
        `/api/aven?conversation=${selected}&before=${messages[0].id}`,
      );
      setMessages((current) => [...older.messages, ...current]);
      setHasOlder(older.hasOlder);
    } catch {
      setError(t("errors.serviceUnavailable"));
    } finally {
      setBusy(false);
    }
  };
  const enableReminders = async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const value = await featureRequest<{
        preferences: Bootstrap["preferences"];
      }>("/api/aven", { kind: "enableReminders" });
      setBootstrap((current) => ({
        ...current,
        preferences: value.preferences,
      }));
    } catch {
      setError(t("errors.serviceUnavailable"));
    } finally {
      setActionBusy(false);
    }
  };
  const send = async (text = input, retry = false) => {
    if (sending.current || busy || !text.trim()) return;
    const submission = text.trim();
    const prior = lastAttempt.current;
    retry ||= Boolean(prior?.failed && prior.message === submission);
    if (!bootstrap.preferences.ai.consent) {
      setError(t("consentRequired"));
      return;
    }
    if (!bootstrap.preferences.configured) {
      setError(
        t(
          `errors.${bootstrap.preferences.configurationError ?? "aiNotConfigured"}`,
        ),
      );
      return;
    }
    sending.current = true;
    stopped.current = false;
    setGenerating(true);
    setActivity("working");
    setError("");
    setLastMessage(submission);
    followLatest.current = true;
    const requestId = crypto.randomUUID(),
      assistantId = `${requestId}-assistant`;
    const acceptedRetry = retry && Boolean(prior?.accepted);
    lastAttempt.current = {
      message: submission,
      requestId,
      originalRequestId: acceptedRetry ? prior!.originalRequestId : requestId,
      conversationId: acceptedRetry ? prior!.conversationId : selected,
      accepted: acceptedRetry,
      failed: false,
    };
    setMessages((current) => [
      ...current.filter((message) => message.status !== "notSent"),
      ...(acceptedRetry
        ? []
        : [
            {
              id: requestId,
              requestId,
              role: "user",
              content: submission,
              status: "pending",
              createdAt: new Date().toISOString(),
            },
          ]),
      {
        id: assistantId,
        requestId,
        role: "assistant",
        content: "",
        status: "streaming",
        createdAt: new Date().toISOString(),
      },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    let conversationId = lastAttempt.current.conversationId,
      completed = false;
    try {
      const response = await fetch("/api/aven/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          notificationId: replyNotification ?? null,
          retryRequestId: acceptedRetry ? prior!.originalRequestId : null,
          goalId: activeGoal,
          requestId,
          message: submission,
          planning,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const value = await response.json();
        throw new Error(value.error ?? "aiUnavailable");
      }
      for await (const raw of responseEvents(response.body)) {
        const event = raw as unknown as {
          type: string;
          id?: string;
          text?: string;
          code?: string;
          name?: string;
          proposal?: ProposalRecord;
        };
        if (event.type === "conversation" && event.id) {
          conversationId = event.id;
          setSelected(event.id);
          if (lastAttempt.current) {
            lastAttempt.current.accepted = true;
            lastAttempt.current.conversationId = event.id;
          }
          setInput((current) => (current.trim() === submission ? "" : current));
          setMessages((current) =>
            current.map((message) =>
              message.id === requestId
                ? { ...message, status: "complete" }
                : message,
            ),
          );
        }
        if (event.type === "tool") setActivity(event.name ?? "working");
        if (event.type === "replace") {
          setActivity(undefined);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: event.text ?? "" }
                : message,
            ),
          );
        }
        if (event.type === "delta") {
          setActivity(undefined);
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + event.text }
                : message,
            ),
          );
          if (followLatest.current && chatScroll.current)
            chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
        }
        if (event.type === "proposal" && event.proposal)
          setProposals((current) => [
            ...current.filter((proposal) => proposal.id !== event.proposal!.id),
            event.proposal!,
          ]);
        if (event.type === "error")
          throw new Error(event.code ?? "aiUnavailable");
        if (event.type === "done") completed = true;
      }
      if (!completed) throw new Error("aiUnavailable");
      if (lastAttempt.current) lastAttempt.current.failed = false;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, status: "complete" }
            : message,
        ),
      );
      if (conversationId)
        await reload(conversationId).catch(() =>
          setError(t("errors.historyRefreshFailed")),
        );
    } catch (error) {
      const key = stopped.current
        ? "generationStopped"
        : (error as Error).message;
      if (lastAttempt.current) lastAttempt.current.failed = !stopped.current;
      if (!stopped.current) setInput((current) => current || submission);
      setError(
        t.has("errors." + key) ? t("errors." + key) : t("errors.aiUnavailable"),
      );
      if (!conversationId) {
        try {
          const recovered = await featureRequest<
            ConversationResult & { found: boolean }
          >("/api/aven?request=" + requestId);
          if (recovered.found) {
            conversationId = recovered.conversation.id;
            setSelected(conversationId);
            setActiveGoal(recovered.conversation.goalId);
            setMessages(recovered.messages);
            if (lastAttempt.current) {
              lastAttempt.current.accepted = true;
              lastAttempt.current.conversationId = conversationId;
            }
          }
        } catch {}
      }
      if (conversationId) await reload(conversationId).catch(() => {});
      else
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  status: stopped.current ? "cancelled" : "error",
                  content: key,
                }
              : message.role === "user" && message.id === requestId
                ? { ...message, status: "notSent" }
                : message,
          ),
        );
    } finally {
      sending.current = false;
      setGenerating(false);
      setActivity(undefined);
      abort.current = null;
    }
  };
  return (
    <div className="aven-page flex min-h-0 flex-col">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-primary dark:text-primary text-h2">
            {t("title")}
          </h1>
          <p className="text-muted dark:text-muted mt-1 hidden text-caption sm:block">
            {contextTitle
              ? t("goalContext", { title: contextTitle })
              : t("description")}
          </p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <AvenNavigation tab={tab} onChange={setTab} />
          {tab === "chat" && (
            <button
              type="button"
              aria-expanded={sidebarOpen}
              aria-label={t(
                sidebarOpen ? "hideConversations" : "showConversations",
              )}
              aria-controls="aven-conversations"
              onClick={() => toggleSidebar(!sidebarOpen)}
              className="text-secondary dark:text-secondary inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-small dark:border-gray-700 dark:bg-gray-dark"
            >
              <ListIcon className="size-4" />
              <span className="hidden sm:inline">
                {t(sidebarOpen ? "hideConversations" : "showConversations")}
              </span>
            </button>
          )}{" "}
          <Button
            aria-label={t("newConversation")}
            variant="outline"
            disabled={busy || generating}
            onClick={() => {
              setReplyNotification(undefined);
              router.replace(goalId ? `/aven?goal=${goalId}` : "/aven");
              try {
                sessionStorage.removeItem("aven-selected:" + initial.userId);
              } catch {}
              lastAttempt.current = null;
              setBusy(false);
              setSelected(null);
              setActiveGoal(goalId ?? null);
              setContextTitle(goalTitle);
              setMessages([]);
              setProposals([]);
              setError("");
              setInput("");
            }}
          >
            <EditIcon className="size-4 sm:hidden" />
            <span className="hidden sm:inline">{t("newConversation")}</span>
          </Button>
        </div>
      </header>
      {tab === "chat" && (
        <div className="text-muted dark:text-muted mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-caption">
          <span title={t("budgetHelp")} className="hidden sm:inline">
            {t("budgetSummary", {
              used: bootstrap.preferences.budget.usedUsd.toFixed(2),
              limit: bootstrap.preferences.budget.monthlyUsd.toFixed(2),
            })}
          </span>
          <span className="sm:hidden">
            {t("budgetShort", {
              used: bootstrap.preferences.budget.usedUsd.toFixed(2),
              limit: bootstrap.preferences.budget.monthlyUsd.toFixed(2),
            })}
          </span>
          {bootstrap.preferences.notifications.enabled ? (
            <button
              type="button"
              aria-label={t("remindersActive")}
              onClick={() => setTab("settings")}
              className="text-brand-600 dark:text-brand-300"
            >
              <BellIcon className="size-4 sm:hidden" />
              <span className="hidden sm:inline">{t("remindersActive")}</span>
            </button>
          ) : (
            <button
              type="button"
              aria-label={t("enableStudyReminders")}
              disabled={busy}
              onClick={() => {
                void enableReminders();
              }}
              className="text-brand-600 dark:text-brand-300"
              title={t("reminderSetupHelp")}
            >
              <BellIcon className="size-4 sm:hidden" />
              <span className="hidden sm:inline">
                {t("enableStudyReminders")}
              </span>
            </button>
          )}
        </div>
      )}
      <div
        id={`aven-${tab}`}
        role="tabpanel"
        aria-labelledby={`aven-tab-${tab}`}
        className={tab === "chat" ? "flex min-h-0 flex-1 flex-col" : undefined}
      >
        {tab === "settings" ? (
          <AvenSettings
            initial={bootstrap.preferences}
            onSaved={(preferences) =>
              setBootstrap((current) => ({ ...current, preferences }))
            }
          />
        ) : tab === "notifications" ? (
          <AvenNotifications timezone={timezone} />
        ) : (
          <div className="aven-workspace relative flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-dark">
            {sidebarOpen && (
              <AvenConversationSidebar
                conversations={bootstrap.conversations}
                hasMore={bootstrap.hasMoreConversations}
                onLoadMore={() => {
                  const cursor = bootstrap.conversations.at(-1)?.id;
                  if (!cursor || busy || generating) return;
                  setBusy(true);
                  void featureRequest<
                    Pick<Bootstrap, "conversations" | "hasMoreConversations">
                  >("/api/aven?history=true&before=" + cursor)
                    .then((value) =>
                      setBootstrap((current) => ({
                        ...current,
                        hasMoreConversations: value.hasMoreConversations,
                        conversations: [
                          ...current.conversations,
                          ...value.conversations.filter(
                            (row) =>
                              !current.conversations.some(
                                (existing) => existing.id === row.id,
                              ),
                          ),
                        ],
                      })),
                    )
                    .catch(() => setError(t("errors.historyRefreshFailed")))
                    .finally(() => setBusy(false));
                }}
                selected={selected}
                busy={busy || generating}
                onSelect={(id) => {
                  setReplyNotification(undefined);
                  lastAttempt.current = null;
                  setError("");
                  router.replace(`/aven?conversation=${id}`);
                  followLatest.current = true;
                  setSelected(id);
                  if (window.innerWidth < 1024) toggleSidebar(false);
                }}
                onDelete={setDeleting}
                onClose={() => toggleSidebar(false)}
              />
            )}
            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!bootstrap.preferences.configured && (
                <p
                  role="status"
                  className="rounded-xl border border-warning-200 bg-warning-25 p-4 text-small text-warning-700 dark:border-warning-800 dark:bg-warning-950/20 dark:text-warning-300"
                >
                  {t(
                    `errors.${bootstrap.preferences.configurationError ?? "aiNotConfigured"}`,
                  )}
                </p>
              )}
              {!bootstrap.preferences.ai.onboardingComplete ? (
                <AvenOnboarding
                  available={bootstrap.preferences.configured}
                  onDone={(preferences) =>
                    setBootstrap((current) => ({ ...current, preferences }))
                  }
                />
              ) : (
                !bootstrap.preferences.ai.consent && (
                  <div className="text-secondary dark:text-secondary p-4 text-small">
                    <p>{t("privacyPaused")}</p>
                    <Button
                      variant="outline"
                      onClick={() => setTab("settings")}
                    >
                      {t("openSettings")}
                    </Button>
                  </div>
                )
              )}
              <div
                ref={chatScroll}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  followLatest.current =
                    node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                }}
                aria-live="polite"
                aria-busy={generating}
                className="aven-chat-scroll custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6"
              >
                {hasOlder && selected && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      void loadOlder();
                    }}
                  >
                    {t("loadOlder")}
                  </Button>
                )}
                {!messages.length && (
                  <div className="py-5">
                    <CommandIcon className="mb-3 size-8 text-brand-500 dark:text-brand-300" />
                    <h2 className="text-primary dark:text-primary text-h3">
                      {t("welcome")}
                    </h2>
                    <p className="text-secondary dark:text-secondary mt-2 text-body">
                      {t("welcomeHelp")}
                    </p>
                  </div>
                )}
                {busy && selected && !generating && (
                  <AvenActivity name="history" />
                )}
                {messages
                  .filter(
                    (message) =>
                      message.status !== "streaming" || message.content,
                  )
                  .map((message) => (
                    <article
                      key={message.id}
                      data-role={message.role}
                      className={`w-fit min-w-0 rounded-xl p-4 ${message.role === "user" ? "ms-auto max-w-3xl bg-brand-50 dark:bg-brand-950/30" : "me-auto max-w-5xl bg-gray-50 dark:bg-gray-900"}`}
                    >
                      <p className="text-muted dark:text-muted mb-2 text-overline">
                        {t(message.role === "user" ? "you" : "title")}
                      </p>
                      {(message.status === "error" ||
                        message.status === "cancelled") &&
                      t.has(`errors.${message.content}`) ? (
                        <p className="text-small text-error-600 dark:text-error-400">
                          {t(`errors.${message.content}`)}
                        </p>
                      ) : (
                        <AvenMarkdown
                          text={
                            message.content ||
                            (message.status === "streaming"
                              ? t("activity.working")
                              : t("errors.emptyResponse"))
                          }
                        />
                      )}
                      {message.createdAt && (
                        <time
                          dateTime={message.createdAt}
                          className="text-muted dark:text-muted mt-2 block text-caption"
                        >
                          {new Date(message.createdAt).toLocaleTimeString("en",
                            {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone: timezone,
                            },
                          )}
                          {(message.status === "error" ||
                            message.status === "cancelled") &&
                            message ===
                              messages.findLast(
                                (item) => item.role === "assistant",
                              ) &&
                            (() => {
                              const source = messages.findLast(
                                (item) =>
                                  item.role === "user" &&
                                  item.requestId ===
                                    (message.context?.replyTo ??
                                      message.requestId),
                              );
                              return source?.requestId ? (
                                <Button
                                  variant="outline"
                                  disabled={busy || generating}
                                  onClick={() => {
                                    lastAttempt.current = {
                                      message: source.content,
                                      requestId: source.requestId!,
                                      originalRequestId: source.requestId!,
                                      conversationId: selected,
                                      accepted: true,
                                      failed: true,
                                    };
                                    void send(source.content, true);
                                  }}
                                >
                                  {t("retry")}
                                </Button>
                              ) : null;
                            })()}
                        </time>
                      )}
                    </article>
                  ))}
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    references={references}
                    locked={generating}
                    onResolved={() => {
                      if (selected) void reload(selected);
                      router.refresh();
                    }}
                  />
                ))}
                {activity && generating && <AvenActivity name={activity} />}
                <div ref={end} />
              </div>
              <div className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 whitespace-nowrap">
                {["today", "weekly", "plan", "recovery"].map((key) => (
                  <button
                    type="button"
                    key={key}
                    disabled={busy}
                    onClick={() => {
                      setPlanning(
                        key === "plan" ||
                          key === "recovery" ||
                          key === "weekly",
                      );
                      setInput(
                        t(`prompts.${key}`, {
                          title: contextTitle ?? t("myGoal"),
                        }),
                      );
                    }}
                    className="text-secondary dark:text-secondary shrink-0 rounded-full border border-gray-200 bg-white px-3 py-2 text-small hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-dark dark:hover:border-brand-700 dark:hover:text-brand-300"
                  >
                    {t(`quick.${key}`)}
                  </button>
                ))}
              </div>
              {error && (
                <div
                  role="alert"
                  className="text-small text-error-600 dark:text-error-400"
                >
                  <p>{error}</p>
                  {lastMessage && lastAttempt.current?.failed && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        void send(lastMessage, true);
                      }}
                    >
                      {t("retry")}
                    </Button>
                  )}
                </div>
              )}
              <AvenComposer
                value={input}
                onChange={setInput}
                onSubmit={() => {
                  void send();
                }}
                busy={generating}
                onStop={() => {
                  stopped.current = true;
                  const attempt = lastAttempt.current;
                  if (attempt?.accepted && attempt.conversationId)
                    void featureRequest("/api/aven/chat/cancel", {
                      conversationId: attempt.conversationId,
                      requestId: attempt.requestId,
                    })
                      .then(() => reload(attempt.conversationId!))
                      .catch(() => {});
                  abort.current?.abort();
                }}
                enabled={bootstrap.preferences.configured && !busy}
                consent={bootstrap.preferences.ai.consent}
              />
            </section>
          </div>
        )}
      </div>
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
            if (selected === deleting) {
              setSelected(null);
              setMessages([]);
              setProposals([]);
            }
            setBootstrap(await featureRequest<Bootstrap>("/api/aven"));
            setDeleting(undefined);
            return true;
          } catch {
            setError(t("errors.serviceUnavailable"));
            return false;
          }
        }}
      />
    </div>
  );
}
