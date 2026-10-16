"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeatureRequestError, featureRequest } from "@/lib/goals/client";

/**
 * Read one Study Circles view. `pollSeconds` refreshes it while the tab is
 * visible (leaderboards), which keeps standings current without a socket.
 */
export function useCircles<T>(params: Record<string, string | undefined> | null, pollSeconds?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const query = params ? new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString() : null;
  const generation = useRef(0);
  const load = useCallback(async (quiet = false) => {
    if (!query) return;
    const run = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const value = await featureRequest<T>(`/api/circles?${query}`);
      if (run === generation.current) { setData(value); setError(null); }
    } catch (cause) {
      if (run === generation.current) setError(cause instanceof FeatureRequestError ? cause.code : "serviceUnavailable");
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!pollSeconds) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, pollSeconds * 1000);
    return () => clearInterval(timer);
  }, [load, pollSeconds]);
  return { data, error, loading, reload: () => load(true) };
}

/** POST a Study Circles action; resolves with the server result or throws its error code. */
export async function circlesAction<T = Record<string, unknown>>(body: Record<string, unknown>) {
  try { return await featureRequest<T>("/api/circles", body); }
  catch (cause) { throw new Error(cause instanceof FeatureRequestError ? cause.code : "serviceUnavailable"); }
}
