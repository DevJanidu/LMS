"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { timerElapsed } from "@/lib/analytics";
import { updateWorkspace, useNow, useWorkspace } from "@/lib/mock/store";
import { clockTime } from "@/lib/time";
import type { Workspace } from "@/types";
interface Props {
  initial: Workspace;
}
/** Persistent timer link; unattended sessions pause at the six-hour checkpoint. */
export default function ActiveTimerIndicator({ initial }: Props) {
  const data = useWorkspace(initial);
  const now = useNow();
  const t = useTranslations("studyflow");
  const timer = data.timer;
  const elapsed = timer && now ? timerElapsed(timer, now) : 0;
  useEffect(() => {
    if (
      timer &&
      now &&
      !timer.pausedAt &&
      elapsed >= timer.confirmedUntilSeconds
    ) {
      const pausedAt = new Date(
        Date.parse(timer.startedAt) +
          (timer.confirmedUntilSeconds + timer.pausedTotalSeconds) * 1000,
      ).toISOString();
      updateWorkspace(initial, (state) =>
        state.timer?.startedAt === timer.startedAt
          ? { ...state, timer: { ...state.timer, pausedAt } }
          : state,
      );
    }
  }, [elapsed, initial, now, timer]);
  if (!timer) return null;
  return (
    <Link
      href="/study"
      className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-success-50 px-3 py-2 text-theme-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-300"
    >
      <span aria-hidden="true">●</span>
      {t(timer.pausedAt ? "pausedStudying" : "studying", {
        subject:
          data.subjects.find((subject) => subject.id === timer.subjectId)
            ?.title ?? "",
      })}
      <span dir="ltr" className="tabular-nums">
        {clockTime(elapsed)}
      </span>
    </Link>
  );
}
