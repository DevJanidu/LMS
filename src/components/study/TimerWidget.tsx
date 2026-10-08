"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/hooks/useModal";
import { timerElapsed } from "@/lib/analytics";
import { getSubjects } from "@/lib/workspace/queries";
import { runOperation, useNow, useWorkspace, useWorkspacePending } from "@/lib/workspace/store";
import { clockTime } from "@/lib/time";
import type { Workspace } from "@/types";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";
import PageHeader from "@/components/studyflow/PageHeader";
import EmptyState from "@/components/studyflow/EmptyState";
import ConfirmDialog from "@/components/studyflow/ConfirmDialog";
import Field, { TextField } from "@/components/studyflow/FormFields";
import { primaryLink } from "@/components/studyflow/styles";
import StudySelectors from "./StudySelectors";
interface Props {
  initial: Workspace;
  subject?: string;
  topic?: string;
  embedded?: boolean;
  onStarted?: () => void;
}
/** A single timestamp-based timer persisted on the server. */
export default function TimerWidget({
  initial,
  subject = "",
  topic = "",
  embedded = false,
  onStarted,
}: Props) {
  const data = useWorkspace(initial);
  const pending = useWorkspacePending();
  const t = useTranslations("studyflow");
  const now = useNow();
  const [subjectId, setSubjectId] = useState(subject);
  const [topicId, setTopicId] = useState(topic);
  const [message, setMessage] = useState("");
  const [focusGoal, setFocusGoal] = useState("");
  const finish = useModal();
  const discard = useModal();
  const timer = data.timer;
  const elapsed = timer && now ? Math.min(timerElapsed(timer, now), timer.confirmedUntilSeconds) : 0;
  const checkpoint = Boolean(timer && elapsed >= timer.confirmedUntilSeconds);
  const pause = () => runOperation(initial, { kind: "timer", value: { command: "pause" } });
  const resume = () => runOperation(initial, { kind: "timer", value: { command: "resume" } });
  const confirm = () => runOperation(initial, { kind: "timer", value: { command: "confirm" } });
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
                  <Button disabled={pending} onClick={confirm} className="mt-3">
                    {t("yesContinue")}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={timer.pausedAt ? resume : pause}
                >
                  {t(timer.pausedAt ? "resume" : "pause")}
                </Button>
                <Button
                  disabled={pending}
                  onClick={async () => {
                    const result = await pause();
                    if (result.ok) finish.openModal(); else setMessage(t(result.error));
                  }}
                >
                  {t("finish")}
                </Button>
                <Button disabled={pending} variant="outline" onClick={discard.openModal}>
                  {t("discard")}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-6"
              onSubmit={async (event) => {
                event.preventDefault(); setMessage("");
                const result = await runOperation(initial, { kind: "timer", value: { command: "start", subjectId, topicId: topicId || undefined, focusGoal: focusGoal.trim() || undefined } });
                if (result.ok) onStarted?.(); else setMessage(t(result.error));
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
              <Button type="submit" disabled={!subjectId || pending} className="w-full">
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
          onSubmit={async (event) => {
            event.preventDefault();
            const note = String(new FormData(event.currentTarget).get("note") ?? "");
            const result = await runOperation(initial, { kind: "timer", value: { command: "finish", note: note.trim() || undefined } });
            setMessage(t(result.ok ? result.timerResult === "saved" ? "sessionSaved" : "sessionTooShort" : result.error));
            if (result.ok) finish.closeModal();
          }}
        >
          <TextField label={t("noteOptional")} name="note" />
          <Button type="submit" disabled={pending}>{t(pending ? "loading" : "saveSession")}</Button>
        </form>
      </Modal>
      <ConfirmDialog
        isOpen={discard.isOpen}
        onClose={discard.closeModal}
        title={t("discardTimer")}
        description={t("discardWarning")}
        onConfirm={() => {
          void runOperation(initial, { kind: "timer", value: { command: "discard" } });
          setMessage(t("timerDiscarded"));
        }}
      />
    </>
  );
}
