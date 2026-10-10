"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Workspace } from "@/types";
import { CalendarStore } from "./store";
import type { CalendarRange } from "./model";

// Bound memory and isolate caches between accounts. No browser persistence of private event data.
const stores = new Map<string, CalendarStore>();
export function useCalendar(initial: Workspace, initialRange: CalendarRange, range: CalendarRange) {
  const [store] = useState(() => {
    if (typeof window === "undefined") return new CalendarStore(initial.user.id, initial.blocks, initialRange, undefined, initial.user.timezone);
    const key = `${initial.user.id}:${initial.user.timezone}`;
    let existing = stores.get(key);
    if (!existing) {
      existing = new CalendarStore(initial.user.id, initial.blocks, initialRange, undefined, initial.user.timezone);
      if (stores.size >= 3) stores.delete(stores.keys().next().value!);
      stores.set(key, existing);
    }
    return existing;
  });
  const serverSnapshot = useMemo(() => ({ blocks: initial.blocks, pending: new Set<string>(), loading: false, error: "", canRetry: false }), [initial]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);
  useEffect(() => { void store.load(range); }, [store, range]);
  useEffect(() => { if (store.synchronizeRevision(initial.user.updatedAt)) void store.load(range, true); }, [store, range, initial.user.updatedAt]);
  useEffect(() => {
    const synchronize = () => { if (document.visibilityState === "visible") void store.load(range, true); };
    const interval = setInterval(synchronize, 30000);
    window.addEventListener("focus", synchronize);
    window.addEventListener("online", synchronize);
    return () => { clearInterval(interval); window.removeEventListener("focus", synchronize); window.removeEventListener("online", synchronize); };
  }, [store, range]);
  return { ...snapshot, store };
}
