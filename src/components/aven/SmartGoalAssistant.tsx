"use client";
import { useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import type { GoalReferences } from "@/lib/goals/service";
import { responseEvents } from "@/lib/aven/stream";
import ProposalCard, { type ProposalRecord } from "./ProposalCard";
import AvenMarkdown from "./AvenMarkdown";
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
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setAnswer("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/aven/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: null,
          goalId: goalId ?? null,
          requestId: crypto.randomUUID(),
          planning: true,
          message: `Refine this user-provided draft into a SMART goal plan, with realistic milestones, task dependencies and controllable success criteria. Read permitted existing subjects and schedules before proposing. Do not apply anything; call proposeGoalPlan for review. Preserve requested linked IDs and target dates unless explaining a proposed revision. Draft: ${JSON.stringify(draft)}`,
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
          text?: string;
          code?: string;
          proposal?: ProposalRecord;
        };
        if (event.type === "delta") setAnswer((value) => value + event.text);
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
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`) ? t(`errors.${key}`) : t("errors.aiUnavailable"),
      );
    } finally {
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
          disabled={busy}
          onClick={() => {
            void generate();
          }}
        >
          {t(busy ? "thinking" : "generatePlan")}
        </Button>
        {answer && <AvenMarkdown text={answer} />}
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
            onResolved={(result) => {
              if (result?.goalId) onSaved(result.goalId);
            }}
          />
        ))}
      </div>
    </Modal>
  );
}
