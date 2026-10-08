import { expect, it } from "vitest";
import { editedSessionInterval } from "@/lib/timer/session-edit";
it("preserves paused timer duration and exact midnight-crossing timestamps during note edits", () => {
  const start = "2026-10-07T23:30:15.123Z", end = "2026-10-08T00:30:15.123Z";
  expect(editedSessionInterval({ startedAt: new Date(start), endedAt: new Date(end), durationSeconds: 1801, source: "timer" }, start, end)).toEqual({ durationSeconds: 1801, source: "timer" });
});
it("uses server-calculated manual duration when a recorded interval is corrected", () => {
  const start = "2026-10-07T23:30:00Z", end = "2026-10-08T00:30:00Z";
  expect(editedSessionInterval({ startedAt: new Date(start), endedAt: new Date(end), durationSeconds: 1800, source: "timer" }, start, "2026-10-07T23:50:00Z")).toEqual({ durationSeconds: 1200, source: "manual" });
});
