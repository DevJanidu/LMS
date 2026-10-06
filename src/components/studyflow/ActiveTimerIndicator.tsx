"use client";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { timerElapsed } from "@/lib/analytics";
import { runOperation, useNow, useWorkspace } from "@/lib/workspace/store";
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
  const elapsed = timer && now ? Math.min(timerElapsed(timer, now), timer.confirmedUntilSeconds) : 0;
  if (!timer) return null;
  return (
    <div
      className={`sf-timer-dock ${timer.pausedAt ? "is-paused" : ""}`}
    >
      <span aria-hidden="true" className="sf-live-dot" />
      <Link href="/study">{t(timer.pausedAt ? "pausedStudying" : "studying", {
        subject:
          data.subjects.find((subject) => subject.id === timer.subjectId)
            ?.title ?? "",
      })}</Link>
      <span dir="ltr" className="tabular-nums">
        {clockTime(elapsed)}
      </span>
      {!timer.pausedAt && <button className="sf-dock-action" aria-label={t("redesign.pauseFocus")} onClick={() => { void runOperation(initial, { kind: "timer", value: { command: "pause" } }); }}>{t("pause")}</button>}
      <Link href="/study" className="sf-dock-action">{t(timer.pausedAt ? "resume" : "finish")}</Link>
    </div>
  );
}
