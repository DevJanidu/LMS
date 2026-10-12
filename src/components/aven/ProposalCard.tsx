"use client";
import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import { featureRequest } from "@/lib/goals/client";
import type { AvenProposal } from "@/lib/aven/validation";
import type { GoalReferences } from "@/lib/goals/service";
import ProposalDetails from "./ProposalDetails";
import AvenActivity from "./AvenActivity";
import ActionCard from "./cards/ActionCard";
import GoalProposalBody from "./cards/GoalProposalBody";
import ScheduleProposalBody from "./cards/ScheduleProposalBody";
import ScheduleChangeBody from "./cards/ScheduleChangeBody";
import { zonedFormatters } from "./cards/formatters";
import { errorKey } from "./types";
export interface ProposalRecord {
  id: string;
  status: string;
  value: AvenProposal;
  expiresAt: string;
  createdAt?: string;
  result?: { goalId?: string; blockIds?: string[]; undo?: unknown } | null;
}
interface Props {
  proposal: ProposalRecord;
  references: GoalReferences;
  onResolved: (result?: ProposalRecord["result"]) => void;
  onModify: (prompt: string) => void;
  locked?: boolean;
}
const approveLabels: Partial<Record<AvenProposal["kind"], string>> = {
  goalPlan: "createGoal",
  schedule: "approveSchedule",
  calendarCreate: "approveSchedule",
  calendarChanges: "confirmChanges",
  reschedule: "confirmChanges",
};
function ProposalCard({
  proposal,
  references,
  onResolved,
  onModify,
  locked = false,
}: Props) {
  const t = useTranslations("aven"),
    c = useTranslations("aven.cards"),
    [resolvedStatus, setStatus] = useState<string>(),
    [resolvedResult, setResult] = useState<ProposalRecord["result"]>(),
    [busy, setBusy] = useState<"approve" | "reject" | "undo">(),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState(false);
  const format = useMemo(
    () => zonedFormatters(references.timezone),
    [references.timezone],
  );
  const { value } = proposal;
  const expired = Date.parse(proposal.expiresAt) < Date.now();
  const status =
      resolvedStatus ??
      (proposal.status === "pending" && expired ? "expired" : proposal.status),
    result = resolvedResult ?? proposal.result;
  const destructive =
    value.kind === "calendarChanges" &&
    value.changes.some((item) => item.action === "cancel");
  const simpleGoal =
    value.kind === "goalPlan" &&
    !value.tasks.length &&
    !value.milestones.length;
  const resolve = async (decision: "approve" | "reject" | "undo") => {
    if (busy || locked) return;
    setBusy(decision);
    setError("");
    try {
      const response = await featureRequest<{
        status: string;
        result: ProposalRecord["result"];
      }>("/api/aven/proposals", { id: proposal.id, decision });
      setStatus(response.status);
      setResult(response.result);
      onResolved(response.result);
    } catch (failure) {
      setError(t(errorKey(t, (failure as Error).message)));
    } finally {
      setBusy(undefined);
    }
  };
  const title =
    value.kind === "goalPlan"
      ? value.goal.title
      : value.kind === "calendarCreate"
        ? value.title
        : t(simpleGoal ? "simpleGoalProposal" : `proposalKinds.${value.kind}`);
  const body =
    value.kind === "goalPlan" ? (
      <GoalProposalBody value={value} />
    ) : value.kind === "schedule" || value.kind === "calendarCreate" ? (
      <ScheduleProposalBody
        value={value}
        references={references}
        format={format}
      />
    ) : value.kind === "calendarChanges" || value.kind === "reschedule" ? (
      <ScheduleChangeBody value={value} format={format} />
    ) : (
      <ProposalDetails
        value={value}
        date={format.dateTime}
        references={references}
      />
    );
  const explanation =
    "explanation" in value && !simpleGoal ? value.explanation : "";
  return (
    <ActionCard
      eyebrow={t(
        simpleGoal ? "simpleGoalProposal" : `proposalKinds.${value.kind}`,
      )}
      title={title}
      status={
        <span className="aven-pill" data-tone={status}>
          {t(`proposalStatuses.${status}`)}
        </span>
      }
      footer={
        <>
          {status === "pending" ? (
            <>
              <Button
                size="sm"
                disabled={Boolean(busy) || locked || expired}
                onClick={() => {
                  if (destructive) setConfirming(true);
                  else void resolve("approve");
                }}
              >
                {t(`cards.${approveLabels[value.kind] ?? "approve"}`)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy) || locked}
                onClick={() =>
                  onModify(
                    c("modifyPrompt", {
                      title:
                        typeof title === "string"
                          ? title
                          : t(`proposalKinds.${value.kind}`),
                    }),
                  )
                }
              >
                {c(value.kind === "goalPlan" ? "editPlan" : "modify")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busy) || locked}
                onClick={() => {
                  void resolve("reject");
                }}
              >
                {c(value.kind === "goalPlan" ? "notNow" : "cancel")}
              </Button>
            </>
          ) : (
            <>
              {result?.goalId && (
                <Link
                  href={`/goals/${result.goalId}`}
                  className="aven-text-button"
                >
                  {t("openGoal")}
                </Link>
              )}
              {(result?.blockIds?.length ||
                ((value.kind === "calendarChanges" ||
                  value.kind === "calendarCreate") &&
                  status === "approved")) && (
                <Link href="/calendar" className="aven-text-button">
                  {t("openPlanner")}
                </Link>
              )}
              {status === "approved" && Boolean(result?.undo) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    void resolve("undo");
                  }}
                >
                  {t("undoChange")}
                </Button>
              )}
            </>
          )}
        </>
      }
    >
      {explanation && <p className="aven-card-text">{explanation}</p>}
      {body}
      {busy === "approve" && <AvenActivity name="applying" />}
      {error && (
        <p
          role="alert"
          className="text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      {status === "pending" && (
        <p className="aven-card-note">{t("reviewHelp")}</p>
      )}
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t("confirmCancellation")}
        description={t("confirmCancellationHelp")}
        onConfirm={async () => {
          await resolve("approve");
          setConfirming(false);
          return true;
        }}
      />
    </ActionCard>
  );
}
export default memo(ProposalCard);
