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
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import AvenMarkdown from "./AvenMarkdown";
import AvenSettings from "./AvenSettings";
import AvenNotifications from "./AvenNotifications";
import ProposalCard, { type ProposalRecord } from "./ProposalCard";
type Bootstrap = Awaited<ReturnType<typeof avenBootstrap>>;
interface Message {
  id: string;
  role: string;
  content: string;
  status: string;
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
}
export default function AvenCompanion({
  initial,
  references,
  timezone,
  goalId,
  goalTitle,
  intent,
  notification,
}: Props) {
  const t = useTranslations("aven"),
    router = useRouter();
  const [bootstrap, setBootstrap] = useState(initial),
    [tab, setTab] = useState<"chat" | "settings" | "notifications">(
      notification ? "notifications" : "chat",
    ),
    [selected, setSelected] = useState<string | null>(null),
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
    if (followLatest.current && chatScroll.current)
      chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [messages, proposals]);
  useEffect(() => {
    if (!selected || sending.current) return;
    setBusy(true);
    const controller = new AbortController();
    void featureRequest<ConversationResult>(
      `/api/aven?conversation=${selected}`,
      undefined,
      controller.signal,
    )
      .then((value) => {
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
  }, [selected, t]);
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
    if (!selected || busy || !messages[0]) return;
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
  const enableAven = async () => {
    if (sending.current || busy) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const value = await featureRequest<{
        preferences: Bootstrap["preferences"];
      }>("/api/aven", { kind: "enableAven" });
      setBootstrap((current) => ({
        ...current,
        preferences: value.preferences,
      }));
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`)
          ? t(`errors.${key}`)
          : t("errors.serviceUnavailable"),
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const enableReminders = async () => {
    if (busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  };
  const send = async (text = input) => {
    if (sending.current || !text.trim()) return;
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
    setBusy(true);
    setError("");
    setLastMessage(text);
    followLatest.current = true;
    setInput("");
    const requestId = crypto.randomUUID(),
      assistantId = `${requestId}-assistant`;
    setMessages((current) => [
      ...current,
      { id: requestId, role: "user", content: text, status: "complete" },
      { id: assistantId, role: "assistant", content: "", status: "streaming" },
    ]);
    const controller = new AbortController();
    abort.current = controller;
    let conversationId = selected,
      completed = false;
    try {
      const response = await fetch("/api/aven/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selected,
          goalId: activeGoal,
          requestId,
          message: text,
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
          proposal?: ProposalRecord;
        };
        if (event.type === "conversation" && event.id) {
          conversationId = event.id;
          setSelected(event.id);
        }
        if (event.type === "delta") {
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
      if (conversationId) await reload(conversationId);
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.aiUnavailable"),
      );
      if (conversationId) await reload(conversationId).catch(() => {});
      else
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, status: "error", content: key }
              : message,
          ),
        );
    } finally {
      sending.current = false;
      setBusy(false);
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
        <div className="flex items-center gap-2">
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
            disabled={busy}
            onClick={() => {
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
      <div
        role="tablist"
        aria-label={t("navigation")}
        className="sf-segments mb-3 shrink-0"
      >
        {(["chat", "notifications", "settings"] as const).map((key) => (
          <button
            key={key}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={(event) => {
              const keys = ["chat", "notifications", "settings"] as const;
              const index = keys.indexOf(key);
              const target =
                event.key === "ArrowRight"
                  ? keys[(index + 1) % 3]
                  : event.key === "ArrowLeft"
                    ? keys[(index + 2) % 3]
                    : event.key === "Home"
                      ? keys[0]
                      : event.key === "End"
                        ? keys[2]
                        : null;
              if (target) {
                event.preventDefault();
                setTab(target);
                document.getElementById(`aven-tab-${target}`)?.focus();
              }
            }}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`aven-${key}`}
            id={`aven-tab-${key}`}
            disabled={busy}
            onClick={() => setTab(key)}
          >
            {t(key === "notifications" ? "notificationsTab" : key)}
          </button>
        ))}
      </div>
      {tab === "chat" && (
        <div className="text-muted dark:text-muted mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-caption">
          <span className="hidden sm:inline">
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
                selected={selected}
                busy={busy}
                onSelect={(id) => {
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
              {!bootstrap.preferences.ai.consent && (
                <div className="text-secondary dark:text-secondary rounded-xl border border-brand-200 bg-brand-25 p-4 text-small dark:border-brand-800 dark:bg-brand-950/20">
                  <p className="text-primary dark:text-primary mb-2 font-semibold">
                    {t("consentRequired")}
                  </p>
                  <p>{t("privacyHelp")}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !bootstrap.preferences.configured}
                      onClick={() => {
                        void enableAven();
                      }}
                    >
                      {t("enableAven")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setTab("settings")}
                    >
                      {t("openSettings")}
                    </Button>
                  </div>
                </div>
              )}
              <div
                ref={chatScroll}
                onScroll={(event) => {
                  const node = event.currentTarget;
                  followLatest.current =
                    node.scrollHeight - node.scrollTop - node.clientHeight < 80;
                }}
                aria-live="polite"
                aria-busy={busy}
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
                {messages.map((message) => (
                  <article
                    key={message.id}
                    data-role={message.role}
                    className={`w-fit min-w-0 rounded-xl p-4 ${message.role === "user" ? "ms-auto max-w-3xl bg-brand-50 dark:bg-brand-950/30" : "me-auto max-w-5xl bg-gray-50 dark:bg-gray-900"}`}
                  >
                    <p className="text-muted dark:text-muted mb-2 text-overline">
                      {t(message.role === "user" ? "you" : "title")}
                    </p>
                    {message.status === "error" &&
                    t.has(`errors.${message.content}`) ? (
                      <p className="text-small text-error-600 dark:text-error-400">
                        {t(`errors.${message.content}`)}
                      </p>
                    ) : (
                      <AvenMarkdown text={message.content || t("thinking")} />
                    )}
                  </article>
                ))}
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.id}
                    proposal={proposal}
                    references={references}
                    onResolved={() => {
                      if (selected) void reload(selected);
                      router.refresh();
                    }}
                  />
                ))}
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
                  {lastMessage && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        void send(lastMessage);
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
                busy={busy}
                enabled={bootstrap.preferences.configured}
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
