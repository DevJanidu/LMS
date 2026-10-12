"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/button/Button";
import {
  runOperation,
  useNow,
  useWorkspacePending,
} from "@/lib/workspace/store";
import { featureRequest } from "@/lib/goals/client";
import { canAttend } from "@/lib/study/attendance-model";
import type { BlockOccurrence } from "@/lib/schedule";
import type { Workspace } from "@/types";
export default function AttendSessionButton({
  data,
  occurrence,
  status,
  loading,
}: {
  data: Workspace;
  occurrence: BlockOccurrence;
  status?: string;
  loading?: boolean;
}) {
  const t = useTranslations("studyflow"),
    router = useRouter(),
    clock = useNow(),
    pending = useWorkspacePending("timer");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (status === "completed")
    return (
      <span className="text-small text-success-600 dark:text-success-400">
        {t("attendanceComplete")}
      </span>
    );
  if (
    status === "attended" &&
    data.timer?.attendanceId &&
    data.timer.subjectId === occurrence.block.subjectId
  )
    return (
      <Button variant="outline" onClick={() => router.push("/study")}>
        {t("attendanceContinue")}
      </Button>
    );
  const eligible = canAttend(
    occurrence,
    clock || Date.parse(data.loadedAt ?? data.user.lastActiveAt),
  );
  return (
    <div className="space-y-2">
      <Button
        disabled={
          loading || pending || busy || !eligible || Boolean(data.timer)
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          const schedule = {
            blockId: occurrence.block.id,
            date: occurrence.date,
            expectedStartsAt: occurrence.startsAt,
          };
          try {
            if (occurrence.block.subjectId) {
              const result = await runOperation(data, {
                kind: "timer",
                value: {
                  command: "start",
                  subjectId: occurrence.block.subjectId,
                  topicId: occurrence.block.topicId,
                  focusGoal: occurrence.title,
                  schedule,
                },
              });
              if (!result.ok) throw new Error(result.error);
            } else
              await featureRequest("/api/study/attendance", {
                ...schedule,
                status: "attended",
              });
            router.push(
              `/study?block=${occurrence.block.id}&date=${occurrence.date}`,
            );
          } catch (failure) {
            const key = (failure as Error).message;
            setError(t.has(key) ? t(key) : t("attendanceUnavailable"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("attendSession")}
      </Button>
      {!eligible && (
        <p className="text-muted dark:text-muted text-small">
          {t("attendanceWindow")}
        </p>
      )}
      {data.timer && (
        <p className="text-muted dark:text-muted text-small">
          {t("timerAlreadyRunning")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-small text-error-600 dark:text-error-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
