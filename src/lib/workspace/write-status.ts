"use client";
import { useEffect, useSyncExternalStore } from "react";

type Outcome = "saved" | "failed" | "uncertain";
const states = new Map<string, { pending: number; outcome?: Outcome }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const key = (owner: string) => `sf-unconfirmed:${owner}`;
function remember(owner: string, value: boolean) {
  try { if (value) sessionStorage.setItem(key(owner), "1"); else sessionStorage.removeItem(key(owner)); } catch { /* Storage may be disabled; pending unload protection still applies. */ }
}
/** Store only an uncertainty flag, never private records or replayable mutations. */
export function beginWrite(owner: string) {
  const state = states.get(owner) ?? { pending: 0 };
  if (!state.pending && state.outcome !== "uncertain") state.outcome = undefined;
  state.pending++; states.set(owner, state); remember(owner, true); emit();
  let finished = false;
  return (outcome: Outcome) => {
    if (finished) return;
    finished = true; state.pending--;
    if (state.outcome !== "uncertain" && (state.outcome !== "failed" || outcome === "uncertain")) state.outcome = outcome;
    remember(owner, state.pending > 0 || state.outcome === "uncertain"); emit();
  };
}
export function acknowledgeUncertainWrites(owner: string) {
  const state = states.get(owner);
  if (state) state.outcome = undefined;
  remember(owner, Boolean(state?.pending)); emit();
}
export function useWriteStatus(owner: string) {
  useEffect(() => {
    try { if (sessionStorage.getItem(key(owner)) && !states.get(owner)?.pending) { states.set(owner, { pending: 0, outcome: "uncertain" }); emit(); } } catch { /* Optional persistence. */ }
    const protect = (event: BeforeUnloadEvent) => {
      if (!states.get(owner)?.pending) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [owner]);
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => states.get(owner)?.pending ? "saving" : states.get(owner)?.outcome ?? "", () => "");
}
