"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/hooks/useModal";
import { timerElapsed } from "@/lib/analytics";
import { TIMER_LIMIT_SECONDS } from "@/lib/constants";
import { getSubjects, getTopics } from "@/lib/mock";
import { newId, updateWorkspace, useNow, useWorkspace } from "@/lib/mock/store";
import { clockTime } from "@/lib/time";
import type { Workspace } from "@/types";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Field, { TextField } from "@/components/studyflow/FormFields";
import { primaryLink } from "@/components/studyflow/WorkspaceShell";
import StudySelectors from "./StudySelectors";
interface Props {
  initial: Workspace;
  subject?: string;
  topic?: string;
  embedded?: boolean;
  onStarted?: () => void;
}
/** A single timestamp-based timer persisted by the mock adapter. */
export default function TimerWidget({
  initial,
  subject = "",
  topic = "",
  embedded = false,
  onStarted,
}: Props) {
  const data = useWorkspace(initial);
  const t = useTranslations("studyflow");
  const now = useNow();
  const [subjectId, setSubjectId] = useState(subject);
  const [topicId, setTopicId] = useState(topic);
  const [message, setMessage] = useState("");
  const [focusGoal, setFocusGoal] = useState("");
  const finish = useModal();
  const discard = useModal();
  const timer = data.timer;
  const elapsed = timer && now ? timerElapsed(timer, now) : 0;
  const checkpoint = Boolean(timer && elapsed >= timer.confirmedUntilSeconds);
  const pause = () =>
    updateWorkspace(initial, (state) =>
      state.timer && !state.timer.pausedAt
        ? {
            ...state,
            timer: { ...state.timer, pausedAt: new Date().toISOString() },
          }
        : state,
    );
  const resume = () =>
    updateWorkspace(initial, (state) => {
      if (!state.timer?.pausedAt) return state;
      const time = Date.now();
      const current = timerElapsed(state.timer, time);
      return {
        ...state,
        timer: {
          ...state.timer,
          pausedTotalSeconds:
            state.timer.pausedTotalSeconds +
            (time - Date.parse(state.timer.pausedAt)) / 1000,
          pausedAt: undefined,
          confirmedUntilSeconds:
            current >= state.timer.confirmedUntilSeconds
              ? current + TIMER_LIMIT_SECONDS
              : state.timer.confirmedUntilSeconds,
        },
      };
    });
  return (
    <>
      {!embedded && <PageHeader
        title={t("study")}
        description={t("studyDescription")}
        action={
          <Link
            href="/study/history"
            className="text-sm text-brand-600 dark:text-brand-300"
          >
            {t("viewHistory")}
          </Link>
        }
      />}
      <div className={`sf-focus mx-auto max-w-3xl ${timer && !timer.pausedAt ? "is-focusing" : ""}`}>
        <ComponentCard
          title={
            timer
              ? (data.subjects.find((item) => item.id === timer.subjectId)
                  ?.title ?? t("study"))
              : t("readyStudy")
          }
        >
          {!getSubjects(data).some((item) => item.status === "active") &&
          !timer ? (
            <EmptyState
              title={t("noSubjects")}
              action={
                <Link href="/subjects?add=1" className={primaryLink}>
                  {t("addSubject")}
                </Link>
              }
            />
          ) : timer ? (
            <div className="space-y-6 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {data.topics.find((item) => item.id === timer.topicId)?.title ??
                  t("focusedTime")}
              </p>
              <output
                aria-label={t("elapsedTime")}
                dir="ltr"
                className="sf-focus-clock block tabular-nums"
              >
                {clockTime(elapsed)}
              </output>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t(timer.pausedAt ? "paused" : "timerRunning")}
              </p>
              {timer.focusGoal && <div className="sf-focus-goal"><p className="sf-eyebrow">{t("redesign.todayGoal")}</p><p className="mt-2 text-base">{timer.focusGoal}</p></div>}
              {checkpoint && (
                <div
                  role="alert"
                  className="rounded-xl bg-warning-50 p-4 text-sm text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
                >
                  <p>{t("stillStudying")}</p>
                  <p className="mt-2">{t("timerCapped")}</p>
                  <Button onClick={resume} className="mt-3">
                    {t("yesContinue")}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={timer.pausedAt ? resume : pause}
                >
                  {t(timer.pausedAt ? "resume" : "pause")}
                </Button>
                <Button
                  onClick={() => {
                    pause();
                    finish.openModal();
                  }}
                >
                  {t("finish")}
                </Button>
                <Button variant="outline" onClick={discard.openModal}>
                  {t("discard")}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage("");
                updateWorkspace(initial, (state) => {
                  if (state.timer) return state;
                  const selected = getSubjects(state).find(
                    (item) => item.id === subjectId && item.status === "active",
                  );
                  if (!selected) return state;
                  const validTopic = getTopics(state, subjectId).find(
                    (item) => item.id === topicId,
                  );
                  return {
                    ...state,
                    timer: {
                      focusGoal: focusGoal.trim() || undefined,
                      subjectId,
                      topicId: validTopic?.id,
                      startedAt: new Date().toISOString(),
                      pausedTotalSeconds: 0,
                      confirmedUntilSeconds: TIMER_LIMIT_SECONDS,
                    },
                  };
                });
                onStarted?.();
              }}
            >
              <StudySelectors
                data={data}
                subjectId={subjectId}
                topicId={topicId}
                onSubjectChange={setSubjectId}
                onTopicChange={setTopicId}
              />
              <Field label={t("redesign.focusGoal")} placeholder={t("redesign.focusGoalHint")} value={focusGoal} onChange={event => setFocusGoal(event.target.value)} maxLength={200} />
              <Button type="submit" disabled={!subjectId} className="w-full">
                {t("start")}
              </Button>
              <p className="text-center text-theme-xs text-gray-400 dark:text-gray-500">
                {t("timerPersistence")}
              </p>
            </form>
          )}
          {message && (
            <p
              role="status"
              className="rounded-xl bg-brand-50 p-4 text-sm text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
            >
              {message}
            </p>
          )}
        </ComponentCard>
      </div>
      <Modal
        isOpen={finish.isOpen}
        onClose={finish.closeModal}
        title={t("whatStudied")}
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const note = String(
              new FormData(event.currentTarget).get("note") ?? "",
            );
            let saved = false;
            updateWorkspace(initial, (state) => {
              if (!state.timer) return state;
              const end = state.timer.pausedAt ?? new Date().toISOString();
              const seconds = Math.min(
                timerElapsed(state.timer, Date.parse(end)),
                state.timer.confirmedUntilSeconds,
              );
              if (seconds < 60) return { ...state, timer: null };
              saved = true;
              return {
                ...state,
                timer: null,
                sessions: [
                  {
                    id: newId(),
                    userId: state.user.id,
                    subjectId: state.timer.subjectId,
                    topicId: state.timer.topicId,
                    startedAt: state.timer.startedAt,
                    endedAt: end,
                    durationSeconds: seconds,
                    status: "valid",
                    note: note.trim() || undefined,
                    source: "timer",
                    createdAt: new Date().toISOString(),
                  },
                  ...state.sessions,
                ],
              };
            });
            setMessage(t(saved ? "sessionSaved" : "sessionTooShort"));
            finish.closeModal();
          }}
        >
          <TextField label={t("noteOptional")} name="note" />
          <Button type="submit">{t("saveSession")}</Button>
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={discard.isOpen}
        onClose={discard.closeModal}
        title={t("discardTimer")}
        description={t("discardWarning")}
        onConfirm={() => {
          updateWorkspace(initial, (state) => ({ ...state, timer: null }));
          setMessage(t("timerDiscarded"));
        }}
      />
    </>
  );
}
