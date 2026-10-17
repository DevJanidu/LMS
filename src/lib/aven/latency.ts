/**
 * High-resolution stage timing for one Aven turn. Marks are milliseconds since the request
 * arrived; the summary is logged once as structured JSON (`aven_latency`) with no message
 * content, so p50/p95 can be computed from logs per stage, model and effort.
 */
export function createLatencyTimer(now: () => number = () => performance.now()) {
  const start = now();
  const marks: Record<string, number> = {};
  return {
    /** Records a stage the first time it happens (later calls keep the first value). */
    mark(stage: string) {
      if (!(stage in marks)) marks[stage] = Math.round((now() - start) * 10) / 10;
    },
    /** Times an async step, recording `<stage>Ms` as its own duration. */
    async time<T>(stage: string, step: () => Promise<T>): Promise<T> {
      const begun = now();
      try {
        return await step();
      } finally {
        marks[`${stage}Ms`] = Math.round((now() - begun) * 10) / 10;
      }
    },
    /** Accumulates a duration that happens several times per turn (rounds, tools). */
    add(stage: string, ms: number) {
      marks[stage] = Math.round(((marks[stage] ?? 0) + ms) * 10) / 10;
    },
    now,
    get marks() {
      return { ...marks };
    },
    elapsed() {
      return Math.round((now() - start) * 10) / 10;
    },
  };
}
export type LatencyTimer = ReturnType<typeof createLatencyTimer>;
/** Nearest-rank percentile, for reports built from `aven_latency` logs. */
export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}
