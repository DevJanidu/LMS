"use client";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ArrowDownIcon } from "@/icons";
import type { GoalReferences } from "@/lib/goals/service";
import AvenMessage from "./AvenMessage";
import AvenActivity from "./AvenActivity";
import ProposalCard, { type ProposalRecord } from "./ProposalCard";
import { messageKey, type AvenMessageRecord } from "./types";
interface Props {
  conversationKey: string;
  messages: AvenMessageRecord[];
  proposals: ProposalRecord[];
  references: GoalReferences;
  timezone: string;
  loading: boolean;
  generating: boolean;
  streamingKey?: string;
  activity?: string;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (message: AvenMessageRecord) => void;
  onRegenerate: (message: AvenMessageRecord) => void;
  onAsk: (notificationId: string) => void;
  onProposalResolved: (result?: ProposalRecord["result"]) => void;
  onModify: (prompt: string) => void;
}
const FOLLOW_THRESHOLD = 80;
const positions = new Map<string, number>();
const time = (value?: string) => (value ? Date.parse(value) : Infinity);
export default function AvenTranscript({
  conversationKey,
  messages,
  proposals,
  references,
  timezone,
  loading,
  generating,
  streamingKey,
  activity,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  onRetry,
  onRegenerate,
  onAsk,
  onProposalResolved,
  onModify,
}: Props) {
  const t = useTranslations("aven");
  const scroller = useRef<HTMLDivElement>(null),
    following = useRef(true),
    anchor = useRef<{ first?: string; height: number }>({ height: 0 }),
    [showJump, setShowJump] = useState(false);
  const visible = useMemo(
    () => messages.filter((message) => message.status !== "superseded"),
    [messages],
  );
  const latestKey = useMemo(() => {
    const last = visible.at(-1);
    return last?.role === "assistant" ? messageKey(last) : undefined;
  }, [visible]);
  // Restore the reader's place when returning to a conversation.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || loading) return;
    const saved = positions.get(conversationKey);
    node.scrollTop =
      saved === undefined || saved < 0 ? node.scrollHeight : saved;
    following.current =
      node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_THRESHOLD;
    setShowJump(!following.current);
  }, [conversationKey, loading]);
  // Keep the newest content in view only while the reader is following; keep position when older messages are prepended.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const first = visible[0] ? messageKey(visible[0]) : undefined;
    if (
      anchor.current.first &&
      first !== anchor.current.first &&
      !following.current
    )
      node.scrollTop += node.scrollHeight - anchor.current.height;
    else if (following.current) node.scrollTop = node.scrollHeight;
    anchor.current = { first, height: node.scrollHeight };
  }, [visible, proposals, activity]);
  const onScroll = useCallback(() => {
    const node = scroller.current;
    if (!node) return;
    anchor.current.height = node.scrollHeight;
    const next =
      node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_THRESHOLD;
    // -1 means "at the bottom", so new replies are still in view on return.
    positions.set(conversationKey, next ? -1 : node.scrollTop);
    if (next !== following.current) {
      following.current = next;
      setShowJump(!next);
    }
  }, [conversationKey]);
  const jump = () => {
    const node = scroller.current;
    if (!node) return;
    following.current = true;
    setShowJump(false);
    node.scrollTo({
      top: node.scrollHeight,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  // Proposals belong to the turn that created them, so they render before the next user message.
  const items: ReactNode[] = [];
  const queue = [...proposals].sort(
    (a, b) => time(a.createdAt) - time(b.createdAt),
  );
  const flush = (before: number) => {
    while (queue.length && time(queue[0].createdAt) < before) {
      const proposal = queue.shift()!;
      items.push(
        <ProposalCard
          key={`proposal:${proposal.id}`}
          proposal={proposal}
          references={references}
          locked={generating}
          onResolved={onProposalResolved}
          onModify={onModify}
        />,
      );
    }
  };
  for (const message of visible) {
    if (message.role === "user") flush(time(message.createdAt));
    const key = messageKey(message);
    const streaming = key === streamingKey;
    if (streaming && !message.content && !message.context?.goalCards) continue;
    items.push(
      <AvenMessage
        key={key}
        message={message}
        timezone={timezone}
        streaming={streaming}
        latest={key === latestKey && !generating}
        disabled={generating}
        onRetry={onRetry}
        onRegenerate={onRegenerate}
        onAsk={onAsk}
      />,
    );
  }
  flush(Infinity);
  return (
    <div className="aven-transcript-frame">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="aven-transcript custom-scrollbar"
        aria-busy={loading || generating}
      >
        <div className="aven-column aven-thread">
          {hasOlder && !loading && (
            <button
              type="button"
              className="aven-text-button self-center"
              disabled={loadingOlder}
              onClick={onLoadOlder}
            >
              {t(loadingOlder ? "loadingOlder" : "loadOlder")}
            </button>
          )}
          {loading ? (
            <div aria-label={t("loadingConversation")} className="space-y-6">
              <div className="aven-skeleton ms-auto h-10 w-2/5" />
              <div className="aven-skeleton h-24 w-4/5" />
              <div className="aven-skeleton ms-auto h-10 w-1/3" />
            </div>
          ) : (
            items
          )}
          {generating && activity && <AvenActivity name={activity} />}
        </div>
      </div>
      {showJump && (
        <button
          type="button"
          className="aven-jump"
          aria-label={t("jumpToLatest")}
          onClick={jump}
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
