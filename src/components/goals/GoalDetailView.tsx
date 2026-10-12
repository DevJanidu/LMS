"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { GoalDetail } from "@/lib/goals/model";
import type { GoalReferences } from "@/lib/goals/service";
import { saveGoal } from "@/lib/goals/client";
import PageHeader from "@/components/studyflow/PageHeader";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import GoalCard from "./GoalCard";
import GoalEditor from "./GoalEditor";
import AdvancedGoalDetailView from "./AdvancedGoalDetailView";
interface Props {
  /** Server-ranked next best action for this goal, rendered below the header. */
  nextAction?: React.ReactNode;
  initial: GoalDetail;
  references: GoalReferences;
}
export default function GoalDetailView({
  initial,
  references,
  nextAction,
}: Props) {
  const t = useTranslations("goals"),
    router = useRouter();
  const [detail, setDetail] = useState(initial),
    [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const complete = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveGoal({
        operationId: crypto.randomUUID(),
        goalId: detail.goal.id,
        expectedVersion: detail.goal.version,
        action: {
          kind: "completion",
          completed: detail.goal.status !== "completed",
        },
      });
      if (result.detail) setDetail(result.detail);
      router.refresh();
    } catch (error) {
      const key = (error as Error).message;
      setError(
        t.has("errors." + key)
          ? t("errors." + key)
          : t("errors.serviceUnavailable"),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title={detail.goal.title} description={t("simpleGoalHelp")} />
      {nextAction && <div className="mb-6 max-w-2xl">{nextAction}</div>}
      {error && (
        <p
          role="alert"
          className="mb-4 text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      <div className="max-w-2xl">
        <GoalCard
          detail={detail}
          busy={busy}
          onEdit={() => setEditing(true)}
          onDelete={() => setDeleting(true)}
          onComplete={() => {
            void complete();
          }}
        />
      </div>
      {(detail.tasks.length > 0 || detail.milestones.length > 0) && (
        <details className="mt-6 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
          <summary className="text-secondary dark:text-secondary cursor-pointer text-small">
            {t("existingStudyPlan")}
          </summary>
          <div className="mt-4">
            <AdvancedGoalDetailView initial={detail} references={references} />
          </div>
        </details>
      )}
      {editing && (
        <GoalEditor
          goal={detail.goal}
          references={references}
          onClose={() => setEditing(false)}
          onSave={async (value) => {
            const result = await saveGoal({
              operationId: crypto.randomUUID(),
              goalId: detail.goal.id,
              expectedVersion: detail.goal.version,
              action: { kind: "goal", value },
            });
            if (result.detail) setDetail(result.detail);
            setEditing(false);
            router.refresh();
          }}
        />
      )}
      <ConfirmDialog
        isOpen={deleting}
        onClose={() => setDeleting(false)}
        title={t("deleteGoal")}
        description={t("deleteWarning")}
        onConfirm={async () => {
          try {
            await saveGoal({
              operationId: crypto.randomUUID(),
              goalId: detail.goal.id,
              expectedVersion: detail.goal.version,
              action: { kind: "deleteGoal" },
            });
            router.push("/goals");
            router.refresh();
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
