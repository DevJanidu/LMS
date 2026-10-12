"use client";
import { useEffect, useState } from "react";
import { featureRequest } from "@/lib/goals/client";
import type { AttendanceRecord } from "@/lib/study/attendance";
export default function useAttendance(revision?: string) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Show pending while the external attendance/calendar request refreshes.
    setLoading(true);
    void featureRequest<{ attendance: AttendanceRecord[] }>(
      "/api/study/attendance",
      undefined,
      controller.signal,
    )
      .then((value) => {
        setRecords(value.attendance);
        setError("");
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("attendanceUnavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  return { records, loading, error, setRecords };
}
