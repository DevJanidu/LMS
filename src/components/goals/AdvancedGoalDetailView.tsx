"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useModal } from "@/hooks/useModal";
import { EditIcon, TrashIcon } from "@/icons";
import Button from "@/components/ui/button/Button";
import PageHeader from "@/components/studyflow/PageHeader";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import ProgressBar from "@/components/studyflow/ProgressBar";
import ComponentCard from "@/components/common/ComponentCard";
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
  const { goal, progress } = detail;
  return (
    <>
      <PageHeader
        title={goal.title}
        description={`${t(`categories.${goal.category}`)} · ${t(`statuses.${goal.status}`)}`}
        action={
          <Button variant="outline" onClick={edit.openModal} disabled={busy}>
            {t("editGoal")}
          </Button>
        }
      />
      <Link
        href="/goals"
        className="mb-5 inline-block text-small text-brand-600 dark:text-brand-300"
      >
        {t("backToGoals")}
      </Link>
      {error && (
        <p
          role="alert"
          className="mb-4 text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <ComponentCard title={t("overview")}>
            <div className="space-y-4">
              <p className="text-secondary dark:text-secondary text-body break-words whitespace-pre-wrap">
                {goal.description}
              </p>
              <ProgressBar
                value={progress.percent}
                label={t("progressValue", { value: progress.percent })}
              />
              <div className="text-secondary dark:text-secondary flex flex-wrap justify-between gap-2 text-small">
                <span>
                  {t("progressValue", { value: progress.percent })} ·{" "}
                  {t(`health.${progress.health}`)}
                </span>
                <span>{t("targetLabel", { date: date(goal.targetDate) })}</span>
              </div>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  [t("fields.motivation"), goal.motivation],
                  [t("fields.successCriteria"), goal.successCriteria],
                  [t("summary.hours"), progress.hours.toFixed(1)],
                  [t("activityTypes.quantity"), String(progress.quantity)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted dark:text-muted text-caption">
                      {label}
                    </dt>
                    <dd className="text-primary dark:text-primary mt-1 text-small break-words whitespace-pre-wrap">
                      {value || t("none")}
                    </dd>
                  </div>
                ))}
              </dl>
              {goal.progressMode === "outcome" && (
                <p className="text-secondary dark:text-secondary text-small">
                  {t("outcomeHelp")}
                </p>
              )}
              {detail.snapshots.length > 0 && (
                <div
                  className="flex items-end gap-2"
                  aria-label={t("progressHistory")}
                >
                  {detail.snapshots
                    .slice(0, 14)
                    .reverse()
                    .map((snapshot) => (
                      <div key={snapshot.date} className="min-w-0 flex-1">
                        <div
                          title={`${snapshot.date}: ${snapshot.progress}%`}
                          className="rounded bg-brand-500 dark:bg-brand-400"
                          style={{
                            height: `${Math.max(2, snapshot.progress)}%`,
                            minHeight: `${Math.max(2, snapshot.progress)}px`,
                          }}
                        />
                        <p className="text-theme-xs text-muted dark:text-muted mt-1 truncate">
                          {snapshot.date.slice(5)}
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </ComponentCard>
          <ComponentCard title={t("milestones")}>
            <div className="mb-4">
              <Button
                variant="outline"
                onClick={() => setMilestone(null)}
                disabled={busy}
              >
                {t("addMilestone")}
              </Button>
            </div>
            <ol className="space-y-4">
              {detail.milestones.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
                >
                  <div className="mb-2 flex justify-between gap-2">
                    <div>
                      <h3 className="text-primary dark:text-primary text-h3">
                        {m.title}
                      </h3>
                      <p className="text-secondary dark:text-secondary text-small">
                        {m.description}
                      </p>
                      {m.dueDate && (
                        <p className="text-muted dark:text-muted mt-1 text-caption">
                          {date(m.dueDate)}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t("editNamed", { title: m.title })}
                        onClick={() => setMilestone(m)}
                        className="text-secondary dark:text-secondary grid size-11 place-items-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <EditIcon className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={t("deleteNamed", { title: m.title })}
                        onClick={() =>
                          setDeleting({ kind: "deleteMilestone", id: m.id })
                        }
                        className="grid size-11 place-items-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-950/40"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                  <ProgressBar
                    value={detail.progress.milestoneProgress[m.id] ?? 0}
                    label={m.title}
                  />
                  {m.dependencyIds.some(
                    (id) => detail.progress.milestoneProgress[id] !== 100,
                  ) && (
                    <p className="mt-2 text-small text-warning-600 dark:text-warning-400">
                      {t("blocked")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </ComponentCard>
          <ComponentCard title={t("tasks")}>
            <div className="mb-4">
              <Button onClick={() => setTask(null)} disabled={busy}>
                {t("addTask")}
              </Button>
            </div>
            <GoalTaskList
              detail={detail}
              busy={busy}
              onEdit={setTask}
              onDelete={(task) =>
                setDeleting({ kind: "deleteTask", id: task.id })
              }
              onToggle={(task) => {
                void mutate(
                  {
                    kind: "task",
                    id: task.id,
                    value: {
                      ...task,
                      status:
                        task.status === "completed" ? "todo" : "completed",
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
          </ComponentCard>
          <ComponentCard title={t("activity")}>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setActivityMode("activity")}
                disabled={busy}
              >
                {t("addActivity")}
              </Button>
              <Button
                variant="outline"
                onClick={() => setActivityMode("session")}
                disabled={busy}
              >
                {t("linkSession")}
              </Button>
            </div>
            <div className="space-y-3">
              {detail.activity.slice(0, 30).map((a) => (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                >
                  <div>
                    <p className="text-primary dark:text-primary text-small">
                      {t(`activityTypes.${a.type}`)} · {a.amount} ·{" "}
                      {date(a.date)}
                    </p>
                    <p className="text-secondary dark:text-secondary mt-1 text-small break-words whitespace-pre-wrap">
                      {a.evidence}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setDeleting({ kind: "deleteActivity", id: a.id })
                    }
                    aria-label={t("deleteActivity")}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-error-600 hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-950/40"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              ))}
              {detail.sessions.map((session) => (
                <div
                  key={session.id}
                  className="text-secondary dark:text-secondary flex items-center justify-between gap-3 text-small"
                >
                  <p>
                    {date(session.startedAt)} · {session.title} ·{" "}
                    {t("trackedMinutes", {
                      count: Math.round(session.allocatedSeconds / 60),
                    })}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setDeleting({ kind: "unlinkSession", id: session.id })
                    }
                    className="text-error-600 dark:text-error-400"
                  >
                    {t("unlink")}
                  </button>
                </div>
              ))}
            </div>
          </ComponentCard>
        </div>
        <aside className="space-y-5">
          <ComponentCard title={t("avenInsights")}>
            <p className="text-secondary dark:text-secondary text-small">
              {progress.nextTaskId
                ? t("nextAction", {
                    title: detail.tasks.find(
                      (task) => task.id === progress.nextTaskId,
                    )!.title,
                  })
                : t("noNextTask")}
            </p>
            <div className="mt-4 space-y-3">
              {["plan", "review", "next", "recovery", "schedule"].map(
                (intent) => (
                  <Link
                    key={intent}
                    href={`/aven?goal=${goal.id}&intent=${intent}`}
                    className="block text-small text-brand-600 dark:text-brand-300"
                  >
                    {t(`avenActions.${intent}`)}
                  </Link>
                ),
              )}
            </div>
          </ComponentCard>
          <ComponentCard title={t("linkedLearning")}>
            <div className="space-y-3">
              {references.subjects
                .filter((s) => goal.subjectIds.includes(s.id))
                .map((s) => (
                  <Link
                    key={s.id}
                    href={`/subjects/${s.id}`}
                    className="block text-small text-brand-600 dark:text-brand-300"
                  >
                    {s.title}
                  </Link>
                ))}
              {references.topics
                .filter((topic) => goal.topicIds.includes(topic.id))
                .map((topic) => (
                  <Link
                    key={topic.id}
                    href={`/subjects/${topic.subjectId}`}
                    className="text-secondary dark:text-secondary block text-small"
                  >
                    {topic.title}
                  </Link>
                ))}
            </div>
          </ComponentCard>
          <ComponentCard title={t("goalCalendar")}>
            <Link
              href="/calendar"
              className="text-small text-brand-600 dark:text-brand-300"
            >
              {t("openPlanner")}
            </Link>
            <p className="text-secondary dark:text-secondary mt-2 text-small">
              {t("calendarHelp")}
            </p>
            <div className="mt-4 space-y-3">
              {detail.calendar?.map((item) => (
                <Link
                  key={item.blockId}
                  href="/calendar"
                  className="block text-small text-brand-600 dark:text-brand-300"
                >
                  {new Date(item.startsAt).toLocaleString(locale, {
                    timeZone: references.timezone,
                  })}{" "}
                  ? {item.title}
                </Link>
              ))}
              {detail.tasks
                .filter((task) => task.dueDate)
                .map((task) => (
                  <p
                    key={task.id}
                    className="text-secondary dark:text-secondary text-small"
                  >
                    {date(task.dueDate!)} · {task.title}
                  </p>
                ))}
            </div>
          </ComponentCard>
          <ComponentCard title={t("fields.resources")}>
            <div className="space-y-3">
              {references.resources
                .filter((r) => goal.resourceIds.includes(r.id))
                .map((r) => (
                  <Link
                    key={r.id}
                    href={`/resources?search=${encodeURIComponent(r.title)}`}
                    className="block text-small text-brand-600 dark:text-brand-300"
                  >
                    {r.title}
                  </Link>
                ))}
            </div>
          </ComponentCard>
          <ComponentCard title={t("history")}>
            <ol className="space-y-2">
              {detail.history.slice(0, 20).map((h) => (
                <li
                  key={h.id}
                  className="text-secondary dark:text-secondary text-small"
                >
                  {date(h.createdAt)} · {t(`historyActions.${h.action}`)} ·{" "}
                  {t("version", { value: h.version })}
                </li>
              ))}
            </ol>
          </ComponentCard>
          <Button
            variant="outline"
            onClick={() => setDeleting({ kind: "deleteGoal" })}
            disabled={busy}
          >
            {t("deleteGoal")}
          </Button>
        </aside>
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
