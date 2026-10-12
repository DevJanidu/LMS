"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { timerElapsed } from "@/lib/analytics";
import {
  runOperation,
  useNow,
  useWorkspace,
  useWorkspacePending,
} from "@/lib/workspace/store";
import { clockTime } from "@/lib/time";
import type { Workspace } from "@/types";
import { useState } from "react";
import { useModal } from "@/hooks/useModal";
import FinishStudyDialog from "@/components/study/FinishStudyDialog";
interface Props {
  initial: Workspace;
}
/** Persistent timer link; unattended sessions pause at the six-hour checkpoint. */
export default function ActiveTimerIndicator({ initial }: Props) {
  const data = useWorkspace(initial);
  const now = useNow();
  const t = useTranslations("studyflow");
  const timer = data.timer;
  const pending = useWorkspacePending("timer");
  const finish = useModal(),
    [error, setError] = useState("");
  const elapsed =
    timer && now
      ? Math.min(timerElapsed(timer, now), timer.confirmedUntilSeconds)
      : 0;
  return (
    <>
      {timer && (
        <div className={`sf-timer-dock ${timer.pausedAt ? "is-paused" : ""}`}>
          <span aria-hidden="true" className="sf-live-dot" />
          <span className="sr-only" role="status" aria-live="polite">
            {t(timer.pausedAt ? "pausedStudying" : "studying", {
              subject:
                data.subjects.find((subject) => subject.id === timer.subjectId)
                  ?.title ?? "",
            })}
          </span>
          <Link href="/study">
            {t(timer.pausedAt ? "pausedStudying" : "studying", {
              subject:
                data.subjects.find((subject) => subject.id === timer.subjectId)
                  ?.title ?? "",
            })}
          </Link>
          <span dir="ltr" className="tabular-nums">
            {clockTime(elapsed)}
          </span>
          {!timer.pausedAt && (
            <button
              disabled={pending}
              className="sf-dock-action"
              aria-label={t("redesign.pauseFocus")}
              onClick={() => {
                void runOperation(initial, {
                  kind: "timer",
                  value: { command: "pause" },
                });
              }}
            >
              {t("pause")}
            </button>
          )}
          {timer.pausedAt && (
            <button
              className="sf-dock-action"
              disabled={pending}
              onClick={() => {
                void runOperation(initial, {
                  kind: "timer",
                  value: { command: "resume" },
                });
              }}
            >
              {t("resume")}
            </button>
          )}
          <button
            className="sf-dock-action"
            disabled={pending}
            onClick={async () => {
              setError("");
              const result = await runOperation(initial, {
                kind: "timer",
                value: { command: "pause" },
              });
              if (result.ok) finish.openModal();
              else setError(t(result.error));
            }}
          >
            {t("finish")}
          </button>
          {error && (
            <span
              role="alert"
              className="text-small text-error-600 dark:text-error-400"
            >
              {error}
            </span>
          )}
        </div>
      )}
      <FinishStudyDialog
        initial={initial}
        isOpen={finish.isOpen}
        onClose={finish.closeModal}
      />
    </>
  );
}
