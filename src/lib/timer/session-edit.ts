interface ExistingInterval {
  startedAt: Date; endedAt: Date; durationSeconds: number; source: "timer" | "manual";
}
/** Note/subject edits retain measured study time, including pauses. */
export function editedSessionInterval(existing: ExistingInterval | undefined, startedAt: string, endedAt: string) {
  const unchanged = existing && existing.startedAt.getTime() === Date.parse(startedAt) && existing.endedAt.getTime() === Date.parse(endedAt);
  return unchanged ? { durationSeconds: existing.durationSeconds, source: existing.source } : { durationSeconds: Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000), source: "manual" as const };
}
