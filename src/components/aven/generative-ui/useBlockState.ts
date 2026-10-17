"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { featureRequest } from "@/lib/goals/client";
import type { SavedState } from "@/lib/aven/ui-components";
import { useBlockEnvironment } from "./BlockContext";
export type SaveStatus = "idle" | "saving" | "saved" | "conflict" | "error";
const SAVE_DELAY_MS = 450;
interface Options<T> {
  requestId?: string;
  componentId: string;
  /** State saved on the server (from the conversation), if any. */
  saved: SavedState<T> | null;
  initial: T;
  /** False for replies that are not saved yet; changes then stay local. */
  persist: boolean;
}
/**
 * Local-first state for an interactive block. Changes apply instantly (no model call, no
 * waiting), are saved after a short pause with compare-and-set, roll back if the save
 * fails, and adopt newer state saved by another tab or device when the conversation
 * refreshes. Rapid changes (several checkboxes) become one save.
 */
export function useBlockState<T>({ requestId, componentId, saved, initial, persist }: Options<T>) {
  const { conversationId, onSaved } = useBlockEnvironment();
  const [data, setData] = useState<T>(saved?.data ?? initial),
    [status, setStatus] = useState<SaveStatus>("idle");
  const confirmed = useRef<SavedState<T> | null>(saved),
    pending = useRef<T | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    inFlight = useRef(false);
  // A newer saved version (refresh, another tab) replaces local state when nothing is pending.
  useEffect(() => {
    if (!saved || saved.v <= (confirmed.current?.v ?? 0) || pending.current || inFlight.current) return;
    confirmed.current = saved;
    setData(saved.data);
  }, [saved]);
  const flush = useCallback(async () => {
    timer.current = undefined;
    const next = pending.current;
    if (next === null || inFlight.current || !conversationId || !requestId) return;
    pending.current = null;
    inFlight.current = true;
    setStatus("saving");
    try {
      const response = await featureRequest<{ saved: boolean; state: SavedState<T> | null }>(
        "/api/aven/components",
        { kind: "state", conversationId, requestId, componentId, base: confirmed.current?.v ?? 0, state: next },
      );
      if (response.saved && response.state) {
        confirmed.current = response.state;
        setStatus("saved");
        onSaved();
      } else {
        // Another tab saved first; its version wins and this change is dropped visibly.
        confirmed.current = response.state;
        if (!pending.current) setData(response.state?.data ?? initial);
        setStatus("conflict");
      }
    } catch {
      // Roll back to the last saved state; the student sees that the change did not stick.
      if (!pending.current) setData(confirmed.current?.data ?? initial);
      setStatus("error");
    } finally {
      inFlight.current = false;
      if (pending.current !== null) timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    }
  }, [conversationId, requestId, componentId, initial, onSaved]);
  useEffect(
    () => () => {
      // Leaving the conversation saves what is pending instead of dropping it.
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );
  // Closing, refreshing or navigating away: an ordinary request would be cancelled with the
  // page, so a change made just before leaving is sent with keepalive instead.
  useEffect(() => {
    const leave = () => {
      const next = pending.current;
      if (next === null || inFlight.current || !conversationId || !requestId) return;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
      void fetch("/api/aven/components", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "state", conversationId, requestId, componentId, base: confirmed.current?.v ?? 0, state: next }),
      }).catch(() => {});
    };
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [conversationId, requestId, componentId]);
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  });
  const update = useCallback(
    (change: (current: T) => T) => {
      const next = change(latest.current);
      latest.current = next;
      setData(next);
      if (!persist) return;
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [persist, flush],
  );
  return { data, update, status, canSave: persist && Boolean(conversationId && requestId) };
}
