"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useModal } from "@/hooks/useModal";
import Button from "@/components/ui/button/Button";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import type { GoalDetail, GoalTask, GoalMilestone } from "@/lib/goals/model";
import { calculateGoalProgress } from "@/lib/goals/model";
import { localDay } from "@/lib/analytics";
import type { GoalReferences } from "@/lib/goals/service";
import type { GoalMutation } from "@/lib/goals/validation";
import { featureRequest, saveGoal } from "@/lib/goals/client";
import GoalEditor from "./GoalEditor";
import TaskEditor from "./TaskEditor";
import MilestoneEditor from "./MilestoneEditor";
import GoalTaskList from "./GoalTaskList";
import GoalActivityEditor from "./GoalActivityEditor";
import GoalDetailHeader from "./GoalDetailHeader";
import GoalMilestoneList from "./GoalMilestoneList";
import GoalContextPanel from "./GoalContextPanel";
import GoalStudyPlan from "./GoalStudyPlan";
import GoalActivityPanel from "./GoalActivityPanel";
import GoalOverview from "./GoalOverview";
import GoalSectionNavigation, {
  type GoalSection,
} from "./GoalSectionNavigation";
interface Props {
  initial: GoalDetail;
  references: GoalReferences;
}
export default function AdvancedGoalDetailView({ initial, references }: Props) {
  const t = useTranslations("goals"),
    locale = useLocale(),
    router = useRouter(),
    edit = useModal();
  const [detail, setDetail] = useState(initial),
    [task, setTask] = useState<GoalTask | null | undefined>(),
    [milestone, setMilestone] = useState<GoalMilestone | null | undefined>(),
    [activityMode, setActivityMode] = useState<"activity" | "session">(),
    [deleting, setDeleting] = useState<GoalMutation["action"]>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [section, setSection] = useState<GoalSection>("overview");
  useEffect(() => {
    const syncSection = () => {
      const value = new URLSearchParams(window.location.search).get("section");
      setSection(
        value === "tasks" || value === "milestones" || value === "studyPlan"
          ? value
          : "overview",
      );
    };
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);
  const selectSection = (value: GoalSection) => {
    setSection(value);
    const url = new URL(window.location.href);
    if (value === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", value);
    window.history.pushState(null, "", url);
  };
  const mutating = useRef(false);
  const refresh = async () => {
    const result = await featureRequest<{ detail: GoalDetail }>(
      `/api/goals?id=${initial.goal.id}`,
    );
    setDetail(result.detail);
  };
  useEffect(() => {
    const controller = new AbortController();
    const sync = () => {
      if (!mutating.current)
        void featureRequest<{ detail: GoalDetail }>(
          `/api/goals?id=${initial.goal.id}`,
          undefined,
          controller.signal,
        )
          .then((r) => setDetail(r.detail))
          .catch(() => {});
    };
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    return () => {
      controller.abort();
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
    };
  }, [initial.goal.id]);
  const mutate = async (action: GoalMutation["action"], optimistic = false) => {
    if (mutating.current) throw new Error("saving");
    mutating.current = true;
    setBusy(true);
    setError("");
    const before = detail;
    if (optimistic && action.kind === "task") {
      const tasks = detail.tasks.map((task) =>
        task.id === action.id ? { ...task, ...action.value } : task,
      );
      setDetail({
        ...detail,
        tasks,
        progress: calculateGoalProgress(
          detail.goal,
          tasks,
          detail.milestones,
          detail.activity,
          detail.sessions,
          localDay(Date.now(), references.timezone),
        ),
      });
    }
    try {
      const result = await saveGoal({
        operationId: crypto.randomUUID(),
        goalId: detail.goal.id,
        expectedVersion: detail.goal.version,
        action,
      });
      if (result.deleted) router.push("/goals");
      else if (result.detail) setDetail(result.detail);
    } catch (error) {
      if (optimistic) setDetail(before);
      const key = (error as Error).message;
      setError(
        t.has(`errors.${key}`)
          ? t(`errors.${key}`)
          : t("errors.serviceUnavailable"),
      );
      await refresh().catch(() => {});
      throw error;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: value.includes("T") ? references.timezone : "UTC",
    }).format(
      value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00Z`),
    );
  const { goal } = detail;
  const renderTasks = (compact = false) => (
    <GoalTaskList
      detail={detail}
      busy={busy}
      compact={compact}
      onAdd={() => setTask(null)}
      onEdit={setTask}
      onDelete={(task) => setDeleting({ kind: "deleteTask", id: task.id })}
      onToggle={(task) => {
        void mutate(
          {
            kind: "task",
            id: task.id,
            value: {
              ...task,
              status: task.status === "completed" ? "todo" : "completed",
              manualProgress: task.status === "completed" ? 0 : 100,
            },
          },
          true,
        ).catch(() => {});
      }}
      onHabit={(task) => {
        void mutate({
          kind: "activity",
          type: "habit",
          taskId: task.id,
          amount: 1,
          evidence: task.title,
          date: localDay(Date.now(), references.timezone),
        }).catch(() => {});
      }}
    />
  );
  return (
    <>
      <GoalDetailHeader
        detail={detail}
        busy={busy}
        onEdit={edit.openModal}
        onDelete={() => setDeleting({ kind: "deleteGoal" })}
        onComplete={() => {
          void mutate({
            kind: "completion",
            completed: goal.status !== "completed",
          }).catch(() => {});
        }}
      />
      {error && (
        <p role="alert" className="goal-error">
          {error}
        </p>
      )}
      <p role="status" className="sr-only">
        {busy
          ? t("saving")
          : t("workspace.progressAnnouncement", {
              value: detail.progress.percent,
            })}
      </p>
      <GoalSectionNavigation section={section} onChange={selectSection} />
      <div className="goal-detail-layout">
        <div
          className="goal-main"
          role="tabpanel"
          id="goal-section-panel"
          aria-labelledby={"goal-tab-" + section}
        >
          {section === "overview" && (
            <GoalOverview
              detail={detail}
              references={references}
              busy={busy}
              onTasks={() => selectSection("tasks")}
              onMilestones={() => selectSection("milestones")}
              taskList={renderTasks(true)}
              milestoneList={
                <GoalMilestoneList
                  detail={detail}
                  busy={busy}
                  snapshot
                  onEdit={setMilestone}
                  onDelete={(m) =>
                    setDeleting({ kind: "deleteMilestone", id: m.id })
                  }
                  onTasks={() => selectSection("tasks")}
                />
              }
            />
          )}
          {section === "tasks" && (
            <section className="goal-panel">
              <div className="goal-section-heading">
                <h2>{t("tasks")}</h2>
                <Button onClick={() => setTask(null)} disabled={busy}>
                  {t("addTask")}
                </Button>
              </div>
              {renderTasks()}
            </section>
          )}
          {section === "milestones" && (
            <section className="goal-panel">
              <div className="goal-section-heading">
                <h2>{t("milestones")}</h2>
                <Button onClick={() => setMilestone(null)} disabled={busy}>
                  {t("addMilestone")}
                </Button>
              </div>
              <GoalMilestoneList
                detail={detail}
                busy={busy}
                onEdit={setMilestone}
                onDelete={(m) =>
                  setDeleting({ kind: "deleteMilestone", id: m.id })
                }
                onTasks={() => selectSection("tasks")}
              />
            </section>
          )}
          {section === "studyPlan" && (
            <>
              <GoalStudyPlan detail={detail} timezone={references.timezone} />
              <GoalActivityPanel
                detail={detail}
                timezone={references.timezone}
                busy={busy}
                onLog={setActivityMode}
                onDelete={setDeleting}
              />
            </>
          )}
          <details className="goal-history">
            <summary>{t("history")}</summary>
            <ol>
              {detail.history.slice(0, 20).map((item) => (
                <li key={item.id}>
                  {date(item.createdAt)} · {t("historyActions." + item.action)}{" "}
                  · {t("version", { value: item.version })}
                </li>
              ))}
            </ol>
          </details>
        </div>
        <GoalContextPanel
          detail={detail}
          references={references}
          onEdit={edit.openModal}
        />
      </div>
      {edit.isOpen && (
        <GoalEditor
          goal={goal}
          references={references}
          onClose={edit.closeModal}
          onSave={async (value) => {
            await mutate({ kind: "goal", value });
            edit.closeModal();
          }}
        />
      )}
      {task !== undefined && (
        <TaskEditor
          task={task ?? undefined}
          detail={detail}
          references={references}
          onClose={() => setTask(undefined)}
          onSave={async (id, value) => {
            await mutate({ kind: "task", id, value });
            setTask(undefined);
          }}
        />
      )}
      {milestone !== undefined && (
        <MilestoneEditor
          milestone={milestone ?? undefined}
          milestones={detail.milestones}
          onClose={() => setMilestone(undefined)}
          onSave={async (id, value) => {
            await mutate({ kind: "milestone", id, value });
            setMilestone(undefined);
          }}
        />
      )}
      {activityMode && (
        <GoalActivityEditor
          detail={detail}
          references={references}
          mode={activityMode}
          onClose={() => setActivityMode(undefined)}
          onSave={async (action) => {
            await mutate(action);
            setActivityMode(undefined);
          }}
        />
      )}
      <ConfirmDialog
        background={false}
        isOpen={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title={t("confirmDelete")}
        description={t(
          deleting?.kind === "deleteGoal"
            ? "deleteWarning"
            : "deleteItemWarning",
        )}
        onConfirm={async () => {
          if (!deleting) return false;
          try {
            await mutate(deleting);
            setDeleting(undefined);
            return true;
          } catch {
            return false;
          }
        }}
      />
    </>
  );
}
