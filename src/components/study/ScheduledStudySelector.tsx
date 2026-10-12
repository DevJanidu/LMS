"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SelectField } from "@/components/studyflow/FormFields";
import { featureRequest } from "@/lib/goals/client";
import { localDay, shiftDay } from "@/lib/analytics";
import { calendarOccurrences } from "@/lib/calendar/model";
import { attendanceFor } from "@/lib/study/attendance-model";
import useAttendance from "@/hooks/useAttendance";
import type { ScheduleBlock, Workspace } from "@/types";
import type { BlockOccurrence } from "@/lib/schedule";
export default function ScheduledStudySelector({
  data,
  selected,
  onSelect,
  blockId,
  date,
}: {
  data: Workspace;
  selected: BlockOccurrence | null;
  onSelect: (value: BlockOccurrence | null) => void;
  blockId?: string;
  date?: string;
}) {
  const t = useTranslations("studyflow"),
    [blocks, setBlocks] = useState<ScheduleBlock[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const seed = useRef("");
  const selectRef = useRef(onSelect);
  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);
  const attendance = useAttendance(data.user.updatedAt);
  const day = localDay(
      Date.parse(data.loadedAt ?? data.user.lastActiveAt),
      data.user.timezone,
    ),
    from = shiftDay(day, -1),
    to = shiftDay(day, 15);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show pending while the external attendance/calendar request refreshes.
    setLoading(true);
    void featureRequest<{ blocks: ScheduleBlock[] }>(
      `/api/calendar?from=${from}&to=${to}`,
      undefined,
      controller.signal,
    )
      .then((value) => {
        setBlocks(value.blocks);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(t("attendanceUnavailable"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [from, to, data.user.updatedAt, t]);
  const occurrences = calendarOccurrences(
    blocks,
    { from, to },
    data.user.timezone,
  );
  useEffect(() => {
    const key = blockId ? blockId + "@" + (date ?? "") : "";
    if (!key || seed.current === key || loading || attendance.loading) return;
    seed.current = key;
    const match = calendarOccurrences(
      blocks,
      { from, to },
      data.user.timezone,
    ).find(
      (item) =>
        item.block.id === blockId &&
        (!date || item.date === date) &&
        attendanceFor(item, attendance.records)?.status !== "completed",
    );
    if (match) selectRef.current(match);
  }, [
    blockId,
    date,
    blocks,
    loading,
    from,
    to,
    data.user.timezone,
    attendance.loading,
    attendance.records,
  ]);
  return (
    <div className="space-y-2">
      <SelectField
        label={t("scheduledStudy")}
        value={selected ? `${selected.block.id}@${selected.date}` : ""}
        disabled={loading || attendance.loading}
        onChange={(event) =>
          onSelect(
            occurrences.find(
              (item) => `${item.block.id}@${item.date}` === event.target.value,
            ) ?? null,
          )
        }
      >
        <option value="">{t(loading ? "loading" : "studyMyChoice")}</option>
        {occurrences
          .filter(
            (item) =>
              attendanceFor(item, attendance.records)?.status !== "completed",
          )
          .map((item) => (
            <option
              key={`${item.block.id}@${item.date}`}
              value={`${item.block.id}@${item.date}`}
            >
              {item.title} ·{" "}
              {new Intl.DateTimeFormat("en", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                timeZone: data.user.timezone,
              }).format(new Date(item.startsAt))}
              {attendanceFor(item, attendance.records)?.status === "skipped"
                ? ` · ${t("attendanceSkipped")}`
                : ""}
            </option>
          ))}
      </SelectField>
      {(error || attendance.error) && (
        <p
          role="alert"
          className="text-small text-error-600 dark:text-error-400"
        >
          {error || t(attendance.error)}
        </p>
      )}
    </div>
  );
}
