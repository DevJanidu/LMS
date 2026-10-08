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
    let existing = stores.get(initial.user.id);
    if (!existing) {
      existing = new CalendarStore(initial.user.id, initial.blocks, initialRange, undefined, initial.user.timezone);
      if (stores.size >= 3) stores.delete(stores.keys().next().value!);
      stores.set(initial.user.id, existing);
    }
    return existing;
  });
  const serverSnapshot = useMemo(() => ({ blocks: initial.blocks, pending: new Set<string>(), loading: false, error: "", canRetry: false }), [initial]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);
  useEffect(() => { void store.load(range); }, [store, range]);
  return { ...snapshot, store };
}
