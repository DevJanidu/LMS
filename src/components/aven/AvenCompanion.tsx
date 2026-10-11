"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CommandIcon, TrashIcon } from "@/icons";
import { useRouter } from "@/i18n/navigation";
import { featureRequest } from "@/lib/goals/client";
import { responseEvents } from "@/lib/aven/stream";
import type { avenBootstrap } from "@/lib/aven/conversations";
import type { GoalReferences } from "@/lib/goals/service";
import PageHeader from "@/components/studyflow/PageHeader";
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { TextField } from "@/components/studyflow/FormFields";
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
    [hasOlder, setHasOlder] = useState(false),
    [summary, setSummary] = useState("");
  const sending = useRef(false),
    abort = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null);
  useEffect(() => () => abort.current?.abort(), []);
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
        setSummary(value.conversation.summary);
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
    setSummary(conversation.conversation.summary);
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
          end.current?.scrollIntoView({ block: "nearest" });
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
    <>
      <PageHeader
        title={t("title")}
        description={
          contextTitle
            ? t("goalContext", { title: contextTitle })
            : t("description")
        }
        action={
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setActiveGoal(goalId ?? null);
              setContextTitle(goalTitle);
              setSummary("");
              setMessages([]);
              setProposals([]);
              setError("");
              setInput("");
            }}
          >
            {t("newConversation")}
          </Button>
        }
      />
      <div
        role="tablist"
        aria-label={t("navigation")}
        className="sf-segments mb-6"
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
      <div
        id={`aven-${tab}`}
        role="tabpanel"
        aria-labelledby={`aven-tab-${tab}`}
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
          <div className="grid gap-5 lg:grid-cols-4">
            <aside className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-dark">
              <h2 className="text-primary dark:text-primary mb-3 text-h3">
                {t("conversations")}
              </h2>
              <div className="custom-scrollbar max-h-96 space-y-2 overflow-y-auto">
                {bootstrap.conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      aria-current={
                        selected === conversation.id ? "true" : undefined
                      }
                      onClick={() => setSelected(conversation.id)}
                      className="text-secondary dark:text-secondary min-w-0 flex-1 rounded-xl px-3 py-2 text-start text-small hover:bg-gray-100 aria-[current=true]:bg-brand-50 aria-[current=true]:text-brand-600 dark:hover:bg-gray-800 dark:aria-[current=true]:bg-brand-950/40 dark:aria-[current=true]:text-brand-300"
                    >
                      <span className="block truncate">
                        {conversation.title}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={t("deleteConversation")}
                      onClick={() => setDeleting(conversation.id)}
                      className="text-muted dark:text-muted grid size-11 shrink-0 place-items-center rounded-lg hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-950/40 dark:hover:text-error-400"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-muted dark:text-muted mt-4 text-caption">
                {t("privacyShort")}
              </p>
            </aside>
            <section className="min-w-0 space-y-4 lg:col-span-3">
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
                aria-live="polite"
                aria-busy={busy}
                className="custom-scrollbar max-h-96 min-h-48 space-y-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-dark"
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
                    className={`min-w-0 rounded-xl p-4 ${message.role === "user" ? "ms-4 bg-brand-50 dark:bg-brand-950/30" : "me-4 bg-gray-50 dark:bg-gray-900"}`}
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
                <div ref={end} />
              </div>
              <div className="flex flex-wrap gap-2">
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
                    className="text-secondary dark:text-secondary rounded-full border border-gray-200 bg-white px-3 py-2 text-small hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-dark dark:hover:border-brand-700 dark:hover:text-brand-300"
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
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <TextField
                  label={t("message")}
                  value={input}
                  maxLength={6000}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={busy}
                  required
                />
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !input.trim() ||
                    !bootstrap.preferences.configured ||
                    !bootstrap.preferences.ai.consent
                  }
                >
                  {t(busy ? "thinking" : "send")}
                </Button>
                {!bootstrap.preferences.ai.consent && (
                  <p
                    role="status"
                    className="text-muted dark:text-muted text-small"
                  >
                    {t("consentRequired")}
                  </p>
                )}
              </form>
              {selected && (
                <details className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <summary className="text-primary dark:text-primary cursor-pointer text-small">
                    {t("summaryMemory")}
                  </summary>
                  <p className="text-muted dark:text-muted my-3 text-caption">
                    {t("summaryHelp")}
                  </p>
                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void featureRequest("/api/aven", {
                        kind: "summary",
                        id: selected,
                        content: summary,
                      })
                        .then(() => setError(""))
                        .catch(() => setError(t("errors.serviceUnavailable")));
                    }}
                  >
                    <TextField
                      label={t("summaryLabel")}
                      value={summary}
                      maxLength={2500}
                      disabled={busy}
                      onChange={(event) => setSummary(event.target.value)}
                    />
                    <Button type="submit" variant="outline" disabled={busy}>
                      {t("save")}
                    </Button>
                  </form>
                </details>
              )}
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
    </>
  );
}
