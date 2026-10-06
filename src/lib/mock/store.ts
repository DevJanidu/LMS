"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MOCK_STORAGE_KEY } from "@/lib/constants";
import type { Workspace } from "@/types";
import { streaks } from "@/lib/analytics";
let snapshot: Workspace | undefined;
let initialized = false;
let storageError = false;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const emit = () => listeners.forEach((listener) => listener());
function isWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Workspace>;
  return Boolean(
    data.user?.id &&
    data.user.timezone &&
    Array.isArray(data.users) &&
    Array.isArray(data.subjects) &&
    Array.isArray(data.topics) &&
    Array.isArray(data.sessions) &&
    Array.isArray(data.resources) &&
    Array.isArray(data.blocks) &&
    Array.isArray(data.notifications) &&
    Array.isArray(data.auditLogs) &&
    data.settings,
  );
}
function readStorage(fallback: Workspace) {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    snapshot = isWorkspace(value) ? value : fallback;
    storageError = Boolean(raw && !isWorkspace(value));
  } catch {
    snapshot = fallback;
    storageError = true;
  }
}
/** Replaceable browser adapter with no additional provider. */
export function useWorkspace(initial: Workspace): Workspace {
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      readStorage(initial);
      emit();
    }
    const sync = (event: StorageEvent) => {
      if (event.key === MOCK_STORAGE_KEY) {
        readStorage(initial);
        emit();
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [initial]);
  return useSyncExternalStore(
    subscribe,
    () => snapshot ?? initial,
    () => initial,
  );
}
export function useStorageError(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => storageError,
    () => false,
  );
}
export function updateWorkspace(
  initial: Workspace,
  change: (data: Workspace) => Workspace,
): void {
  if (!initialized) {
    initialized = true;
    readStorage(initial);
  }
  const next = change(snapshot ?? initial);
  const longest = streaks(
    next.sessions.filter((session) => session.userId === next.user.id),
    next.user.timezone,
    Date.now(),
    next.settings.streakMinutes,
    next.user.longestStreak,
  ).longest;
  snapshot = {
    ...next,
    user: { ...next.user, longestStreak: longest },
    users: next.users.map((user) =>
      user.id === next.user.id ? { ...user, longestStreak: longest } : user,
    ),
  };
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(snapshot));
    storageError = false;
  } catch {
    storageError = true;
  }
  emit();
}
export function newId(): string {
  return crypto.randomUUID();
}
export function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);
  return now;
}
