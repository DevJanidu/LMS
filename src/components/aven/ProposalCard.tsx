"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import Button from "@/components/ui/button/Button";
import { featureRequest } from "@/lib/goals/client";
import type { AvenProposal } from "@/lib/aven/validation";
import type { GoalReferences } from "@/lib/goals/service";
import ProposalDetails from "./ProposalDetails";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
export interface ProposalRecord {
  id: string;
  status: string;
  value: AvenProposal;
  expiresAt: string;
  result?: { goalId?: string; blockIds?: string[]; undo?: unknown } | null;
}
interface Props {
  proposal: ProposalRecord;
  references: GoalReferences;
  onResolved: (result?: ProposalRecord["result"]) => void;
  locked?: boolean;
}
export default function ProposalCard({
  proposal,
  references,
  onResolved,
  locked = false,
}: Props) {
  const t = useTranslations("aven"),
    locale = useLocale(),
    [resolvedStatus, setStatus] = useState<string>(),
    [resolvedResult, setResult] = useState<ProposalRecord["result"]>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const destructive =
    proposal.value.kind === "calendarChanges" &&
    proposal.value.changes.some((item) => item.action === "cancel");
  const status =
      resolvedStatus ??
      (proposal.status === "pending" &&
      Date.parse(proposal.expiresAt) < Date.now()
        ? "expired"
        : proposal.status),
    result = resolvedResult ?? proposal.result;
  const { value } = proposal;
  const simpleGoal =
    value.kind === "goalPlan" &&
    !value.tasks.length &&
    !value.milestones.length;
  const resolve = async (decision: "approve" | "reject" | "undo") => {
    if (busy || locked) return;
    setBusy(true);
    setError("");
    try {
      const response = await featureRequest<{
        status: string;
        result: ProposalRecord["result"];
      }>("/api/aven/proposals", { id: proposal.id, decision });
      setStatus(response.status);
      setResult(response.result);
      onResolved(response.result);
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`)
          ? t(`errors.${key}`)
          : t("errors.serviceUnavailable"),
      );
    } finally {
      setBusy(false);
    }
  };
  const date = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: references.timezone,
    }).format(new Date(date));
  return (
    <article className="rounded-2xl border border-brand-200 bg-brand-25 p-5 dark:border-brand-800 dark:bg-brand-950/20">
      <h3 className="text-primary dark:text-primary text-h3">
        {simpleGoal
          ? t("simpleGoalProposal")
          : t(`proposalKinds.${value.kind}`)}
      </h3>
      <p className="text-secondary dark:text-secondary mt-2 text-small">
        {t("reviewHelp")}
      </p>
      {"explanation" in value && (
        <p className="text-secondary dark:text-secondary mt-3 text-small whitespace-pre-wrap">
          {value.explanation}
        </p>
      )}
      <div className="custom-scrollbar my-4 max-h-96 space-y-3 overflow-y-auto">
        <ProposalDetails value={value} date={date} references={references} />
        {value.kind === "goalPlan" && (
          <>
            <h4 className="text-primary dark:text-primary text-h3">
              {value.goal.title}
            </h4>
            {simpleGoal ? (
              <p className="text-secondary dark:text-secondary text-small">
                {t("goalDue", { date: value.goal.targetDate })}
              </p>
            ) : (
              <>
                {" "}
                <p className="text-secondary dark:text-secondary text-small whitespace-pre-wrap">
                  {value.goal.description}
                </p>
                <p className="text-secondary dark:text-secondary text-small">
                  {value.goal.startDate} → {value.goal.targetDate}
                </p>
                <p className="text-secondary dark:text-secondary text-small">
                  {value.goal.successCriteria}
                </p>
                <p className="text-secondary dark:text-secondary text-small">
                  {value.goal.motivation}
                </p>
                <p className="text-secondary dark:text-secondary text-small">
                  {t("planMetrics", {
                    mode: value.goal.progressMode,
                    hours: value.goal.progressConfig.hoursTarget,
                    quantity: value.goal.progressConfig.quantityTarget,
                  })}
                </p>
                {references.subjects
                  .filter((s) => value.goal.subjectIds.includes(s.id))
                  .map((s) => (
                    <p
                      key={s.id}
                      className="text-secondary dark:text-secondary text-small"
                    >
                      {s.title}
                    </p>
                  ))}
              </>
            )}
            {value.milestones.map((m) => (
              <div
                key={m.key}
                className="rounded-lg border border-brand-100 p-3 dark:border-brand-900"
              >
                <h4 className="text-primary dark:text-primary text-small">
                  {m.value.title}
                </h4>
                <p className="text-secondary dark:text-secondary text-small">
                  {m.value.description}
                </p>
                {m.value.dueDate && (
                  <p className="text-muted dark:text-muted text-caption">
                    {m.value.dueDate}
                  </p>
                )}
              </div>
            ))}
            {value.tasks.map((task) => (
              <div
                key={task.key}
                className="border-s-2 border-brand-300 ps-3 dark:border-brand-700"
              >
                <p className="text-primary dark:text-primary text-small">
                  {task.value.title}
                </p>
                <p className="text-secondary dark:text-secondary text-small">
                  {task.value.description}
                </p>
                <p className="text-muted dark:text-muted text-caption">
                  {t("taskEffort", { minutes: task.value.estimatedMinutes })}
                  {task.value.dueDate && ` · ${task.value.dueDate}`}
                </p>
                {task.dependencyKeys.length > 0 && (
                  <p className="text-secondary dark:text-secondary text-caption">
                    {t("dependsOn", {
                      tasks: task.dependencyKeys
                        .map(
                          (key) =>
                            value.tasks.find((t) => t.key === key)?.value
                              .title ?? key,
                        )
                        .join(", "),
                    })}
                  </p>
                )}
              </div>
            ))}
          </>
        )}
        {value.kind === "schedule" &&
          value.sessions.map((session, index) => (
            <div
              key={index}
              className="rounded-lg border border-brand-100 p-3 dark:border-brand-900"
            >
              <p className="text-primary dark:text-primary text-small">
                {session.title}
              </p>
              <p className="text-secondary dark:text-secondary text-small">
                {date(session.startsAt)} → {date(session.endsAt)}
              </p>
            </div>
          ))}
        {(value.kind === "taskCreate" || value.kind === "taskUpdate") && (
          <>
            <p className="text-primary dark:text-primary text-h3">
              {value.value.title}
            </p>
            <p className="text-secondary dark:text-secondary text-small whitespace-pre-wrap">
              {value.value.description}
            </p>
            <p className="text-secondary dark:text-secondary text-small">
              {t("taskEffort", { minutes: value.value.estimatedMinutes })} ·{" "}
              {value.value.dueDate}
            </p>
            <p className="text-secondary dark:text-secondary text-small">
              {value.value.evidence}
            </p>
          </>
        )}
        {value.kind === "reschedule" && (
          <p className="text-secondary dark:text-secondary text-small">
            {date(value.startsAt)} → {date(value.endsAt)}
          </p>
        )}
        {value.kind === "reminder" && (
          <>
            <p className="text-primary dark:text-primary text-h3">
              {value.title}
            </p>
            <p className="text-secondary dark:text-secondary text-small">
              {value.body}
            </p>
            <p className="text-secondary dark:text-secondary text-small">
              {date(value.scheduledFor)}
            </p>
          </>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="mb-3 text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      {status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              busy || locked || Date.parse(proposal.expiresAt) < Date.now()
            }
            onClick={() => {
              if (destructive) setConfirming(true);
              else void resolve("approve");
            }}
          >
            {t(busy ? "saving" : "approve")}
          </Button>
          <Button
            variant="outline"
            disabled={busy || locked}
            onClick={() => {
              void resolve("reject");
            }}
          >
            {t("reject")}
          </Button>
        </div>
      ) : (
        <p className="text-secondary dark:text-secondary text-small">
          {t(`proposalStatuses.${status}`)}
        </p>
      )}
      {result?.goalId && (
        <Link
          href={`/goals/${result.goalId}`}
          className="mt-3 inline-block text-small text-brand-600 dark:text-brand-300"
        >
          {t("openGoal")}
        </Link>
      )}
      {status === "approved" && Boolean(result?.undo) && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            void resolve("undo");
          }}
        >
          {t("undoChange")}
        </Button>
      )}
      {result?.blockIds?.length ||
      ((value.kind === "calendarChanges" || value.kind === "calendarCreate") &&
        status === "approved") ? (
        <Link
          href="/calendar"
          className="mt-3 inline-block text-small text-brand-600 dark:text-brand-300"
        >
          {t("openPlanner")}
        </Link>
      ) : null}
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
    </article>
  );
}
