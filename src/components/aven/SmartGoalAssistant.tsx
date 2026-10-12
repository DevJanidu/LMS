"use client";
import { useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { TextField } from "@/components/studyflow/FormFields";
import type { GoalReferences } from "@/lib/goals/service";
import { responseEvents } from "@/lib/aven/stream";
import ProposalCard, { type ProposalRecord } from "./ProposalCard";
import AvenMarkdown from "./AvenMarkdown";
import AvenActivity from "./AvenActivity";
import { featureRequest } from "@/lib/goals/client";
interface Props {
  draft: Record<string, unknown>;
  goalId?: string;
  references: GoalReferences;
  onClose: () => void;
  onSaved: (id: string) => void;
}
export default function SmartGoalAssistant({
  draft,
  goalId,
  references,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("aven"),
    [answer, setAnswer] = useState(""),
    [proposals, setProposals] = useState<ProposalRecord[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null),
    [followUp, setFollowUp] = useState("");
  const abort = useRef<AbortController | null>(null);
  const submitting = useRef(false),
    activeRequest = useRef<{
      id: string;
      conversationId: string | null;
    } | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async (reply?: string) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setAnswer("");
    const controller = new AbortController();
    abort.current = controller;
    const requestId = crypto.randomUUID();
    activeRequest.current = { id: requestId, conversationId };
    try {
      const response = await fetch("/api/aven/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          goalId: goalId ?? null,
          requestId,
          planning: true,
          message:
            reply ??
            `Help the user save a simple goal with its title and due date. Ask only for a missing title or deadline. Call proposeGoal for review; do not add milestones, tasks or extra setup unless the user specifically asks. Preserve the goalId when provided. Draft: ${JSON.stringify(draft)}`,
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const result = await response.json();
        throw new Error(result.error ?? "aiUnavailable");
      }
      let completed = false;
      for await (const raw of responseEvents(response.body)) {
        const event = raw as unknown as {
          type: string;
          id?: string;
          text?: string;
          code?: string;
          proposal?: ProposalRecord;
        };
        if (event.type === "conversation" && event.id) {
          setConversationId(event.id);
          activeRequest.current!.conversationId = event.id;
          if (reply) setFollowUp((value) => (value === reply ? "" : value));
        }
        if (event.type === "delta") setAnswer((value) => value + event.text);
        if (event.type === "replace") setAnswer(event.text ?? "");
        if (event.type === "proposal" && event.proposal)
          setProposals((current) => [
            ...current.filter((p) => p.id !== event.proposal!.id),
            event.proposal!,
          ]);
        if (event.type === "error")
          throw new Error(event.code ?? "aiUnavailable");
        if (event.type === "done") completed = true;
      }
      if (!completed) throw new Error("aiUnavailable");
    } catch (error) {
      if (reply && !controller.signal.aborted)
        setFollowUp((value) => value || reply);
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.aiUnavailable"),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={t("smartTitle")} size="wide">
      <div className="space-y-4">
        <p className="text-secondary dark:text-secondary text-small">
          {t("smartHelp")}
        </p>
        <Button
          onClick={() => {
            if (busy) {
              const request = activeRequest.current;
              if (request?.conversationId)
                void featureRequest("/api/aven/chat/cancel", {
                  conversationId: request.conversationId,
                  requestId: request.id,
                }).catch(() => {});
              abort.current?.abort();
            } else void generate();
          }}
        >
          {t(busy ? "stopGeneration" : "generatePlan")}
        </Button>
        {answer && <AvenMarkdown text={answer} />}
        {busy && !answer && <AvenActivity name="working" />}
        {conversationId && (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!followUp.trim()) return;
              const reply = followUp;
              void generate(reply);
            }}
          >
            <TextField
              label={t("message")}
              value={followUp}
              rows={2}
              maxLength={6000}
              required
              disabled={busy}
              onChange={(event) => setFollowUp(event.target.value)}
            />
            <Button type="submit" disabled={busy || !followUp.trim()}>
              {t("send")}
            </Button>
          </form>
        )}
        {error && (
          <div
            role="alert"
            className="space-y-2 text-small text-error-600 dark:text-error-400"
          >
            <p>{error}</p>
            <Link
              href="/aven?intent=plan"
              className="text-brand-600 dark:text-brand-300"
            >
              {t("openSettings")}
            </Link>
          </div>
        )}
        {proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            references={references}
            locked={busy}
            onResolved={(result) => {
              if (result?.goalId) onSaved(result.goalId);
            }}
          />
        ))}
      </div>
    </Modal>
  );
}
