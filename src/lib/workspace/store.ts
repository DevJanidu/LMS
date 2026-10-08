"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { mutateWorkspace, refreshShellWorkspace, refreshWorkspace } from "@/app/[locale]/actions";
import type { Workspace } from "@/types";
import type { Operation } from "@/lib/validation/operations";
let snapshot: Workspace | undefined;
let error = "";
let pending = 0;
let queue: Promise<unknown> = Promise.resolve();
let mounts = 0;
let cleanupPoll: (() => void) | undefined;
let revision = 0;
let refreshing: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
function mergePage(current: Workspace | undefined, next: Workspace): Workspace {
  if (!current || current.user.id !== next.user.id || current.scope !== next.scope) return next;
  const merged = { ...current, loadedAt: next.loadedAt,
    pageFields: [...new Set([...(current.pageFields ?? []), ...(next.pageFields ?? [])])], shellOnly: false };
  for (const field of next.pageFields ?? []) {
    // Each page owns only the fields it requested. A route transition must not
    // clear the timer, notifications, or another page's data with empty defaults.
    (merged as unknown as Record<string, unknown>)[field] = next[field];
  }
  return merged;
}

function operations(before: Workspace, after: Workspace): unknown[] {
  const result: unknown[] = [];
  if (before.user.role === "admin") {
    if (changed(before.user, after.user)) result.push({ kind: "profile", value: after.user });
    if (changed(before.settings, after.settings)) result.push({ kind: "settings", value: after.settings });
    for (const user of after.users) if (before.users.find(u => u.id === user.id)?.status !== user.status) result.push({ kind: "userStatus", id: user.id, status: user.status });
    return result;
  }
  if (changed(before.user, after.user)) result.push({ kind: "profile", value: after.user });
  for (const [key, kind] of [["subjects", "subject"], ["topics", "topic"], ["resources", "resource"], ["sessions", "session"], ["blocks", "block"]] as const) {
    for (const value of after[key]) {
      if (key === "sessions" && "source" in value && value.source === "timer" && !before.sessions.some(s => s.id === value.id)) continue;
      if (changed(before[key].find(row => row.id === value.id), value)) result.push({ kind, value });
    }
  }
  // Let database cascades remove children when their parent is deleted.
  const removedSubjects = new Set(before.subjects.filter(row => !after.subjects.some(next => next.id === row.id)).map(row => row.id));
  const removedTopics = new Set(before.topics.filter(row => !after.topics.some(next => next.id === row.id)).map(row => row.id));
  for (const [key, entity] of [["resources", "resource"], ["sessions", "session"], ["blocks", "block"], ["topics", "topic"], ["subjects", "subject"]] as const) {
    for (const row of before[key]) if (!after[key].some(next => next.id === row.id)) {
      if ("subjectId" in row && row.subjectId && removedSubjects.has(row.subjectId)) continue;
      if ("topicId" in row && row.topicId && removedTopics.has(row.topicId)) continue;
      result.push({ kind: "delete", entity, id: row.id });
    }
  }
  for (const n of after.notifications) if (n.readAt && !before.notifications.find(old => old.id === n.id)?.readAt) result.push({ kind: "readNotification", id: n.id });
  if (!before.timer && after.timer) result.push({ kind: "timer", value: { command: "start", subjectId: after.timer.subjectId, topicId: after.timer.topicId, focusGoal: after.timer.focusGoal } });
  else if (before.timer && !after.timer && !removedSubjects.has(before.timer.subjectId)) {
    const session = after.sessions.find(row => row.source === "timer" && !before.sessions.some(old => old.id === row.id));
    result.push({ kind: "timer", value: session ? { command: "finish", note: session.note } : { command: "discard" } });
  } else if (before.timer && after.timer && changed(before.timer, after.timer)) {
    result.push({ kind: "timer", value: { command: after.timer.confirmedUntilSeconds > before.timer.confirmedUntilSeconds ? "confirm" : after.timer.pausedAt ? "pause" : "resume" } });
  }
  return result;
}
export function useWorkspace(initial: Workspace): Workspace {
  const appliedInitial = useRef<Workspace | undefined>(undefined);
  useEffect(() => {
    const sameScope = snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope;
    const stale = sameScope && Date.parse(initial.user.updatedAt) < Date.parse(snapshot!.user.updatedAt);
    if (!pending && !stale && (!initial.shellOnly || !snapshot || snapshot.user.id !== initial.user.id)) { revision++; snapshot = initial.pageFields ? mergePage(snapshot, initial) : initial; error = ""; }
    appliedInitial.current = initial;
    emit();
  }, [initial]);
  useEffect(() => {
    mounts++;
    if (!cleanupPoll) {
      const refresh = () => { if (!pending) void refreshShellSnapshot(); };
      const interval = setInterval(() => { void refresh(); }, 30000);
      window.addEventListener("focus", refresh);
      cleanupPoll = () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
    }
    return () => { mounts--; if (!mounts) { cleanupPoll?.(); cleanupPoll = undefined; } };
  }, []);
  return useSyncExternalStore(subscribe,
    () => initial.pageFields && appliedInitial.current !== initial ? initial :
      snapshot?.user.id === initial.user.id && (initial.shellOnly || snapshot.scope === initial.scope) ? snapshot : initial,
    () => initial);
}
/** Apply streamed shell details only while a feature page has not supplied fresher data. */
export function hydrateShellWorkspace(next: Workspace) {
  if (snapshot && snapshot.user.id !== next.user.id) return;
  if (snapshot && !snapshot.shellOnly && !snapshot.pageFields) return;
  revision++;
  snapshot = snapshot?.pageFields ? {
    ...snapshot,
    user: snapshot.pageFields.includes("user") ? snapshot.user : next.user,
    users: next.users,
    settings: snapshot.pageFields.includes("settings") ? snapshot.settings : next.settings,
    timer: snapshot.pageFields.includes("timer") ? snapshot.timer : next.timer,
    notifications: next.notifications,
    subjects: snapshot.pageFields.includes("subjects") ? snapshot.subjects : next.subjects,
    shellPending: false,
  } : next;
  emit();
}
/** Apply a range or filter read without replacing the authenticated shell. */
export function hydratePageFields(initial: Workspace, fields: Partial<Workspace>) {
  if (!snapshot || snapshot.user.id !== initial.user.id || snapshot.scope !== initial.scope || pending) return;
  revision++;
  snapshot = { ...snapshot, ...fields };
  emit();
}
export function useStorageError(): boolean { return Boolean(useWorkspaceError()); }
export function useWorkspaceError() { return useSyncExternalStore(subscribe, () => error, () => ""); }
export function useWorkspacePending() { return useSyncExternalStore(subscribe, () => pending > 0, () => false); }
export function updateWorkspace(initial: Workspace, change: (data: Workspace) => Workspace): Promise<boolean> {
  const before = snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot : initial;
  const after = change(before);
  const input = operations(before, after);
  if (!input.length) return Promise.resolve(true);
  revision++; snapshot = after; pending++; error = ""; emit();
  const task = queue.then(async () => {
    try {
      const result = await mutateWorkspace(input, before.scope);
      if (!result.ok) { error = result.error; snapshot = await refreshWorkspace(before.scope); return false; }
      if (pending === 1) snapshot = result.data;
      return true;
    } catch { error = "saveFailed"; snapshot = before; return false; }
    finally { pending--; emit(); }
  });
  queue = task;
  return task;
}
export function runOperation(initial: Workspace, operation: Operation) {
  const task = queue.then(async () => {
    revision++; pending++; error = ""; emit();
    const before = snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot : initial;
    if (operation.kind === "timer") {
      const command = operation.value, now = Date.now(), timer = before.timer;
      if (command.command === "start") snapshot = { ...before, timer: { subjectId: command.subjectId, topicId: command.topicId, focusGoal: command.focusGoal, startedAt: new Date(now).toISOString(), pausedTotalSeconds: 0, confirmedUntilSeconds: 21600 } };
      else if (command.command === "pause" && timer) snapshot = { ...before, timer: { ...timer, pausedAt: timer.pausedAt ?? new Date(now).toISOString() } };
      else if (command.command === "resume" && timer) snapshot = { ...before, timer: { ...timer, pausedAt: undefined, pausedTotalSeconds: timer.pausedTotalSeconds + (timer.pausedAt ? Math.max(0, Math.floor((now - Date.parse(timer.pausedAt)) / 1000)) : 0) } };
      else if (command.command === "discard") snapshot = { ...before, timer: null };
      emit();
    }
    try {
      const result = await mutateWorkspace([operation], initial.scope);
      if (result.ok) snapshot = result.data;
      else { error = result.error; snapshot = before; }
      return result;
    } catch { error = "saveFailed"; snapshot = before; return { ok: false as const, error }; }
    finally { pending--; emit(); }
  });
  queue = task;
  return task;
}
export async function flushWorkspace() { await queue; return !error; }
async function refreshSnapshot() {
  if (refreshing) return refreshing;
  const observed = revision, scope = snapshot?.scope;
  refreshing = (async () => {
    try { const next = await refreshWorkspace(scope); if (!pending && revision === observed) { snapshot = next; emit(); } }
    catch { if (!pending && revision === observed) { error = "saveFailed"; emit(); } }
  })();
  try { await refreshing; } finally { refreshing = undefined; }
}
export async function reloadWorkspace() { await queue; await refreshSnapshot(); }
async function refreshShellSnapshot() {
  try {
    const next = await refreshShellWorkspace();
    if (!snapshot || snapshot.user.id !== next.user.id || pending) return;
    revision++;
    snapshot = { ...snapshot, user: next.user, users: next.users,
      settings: next.settings, timer: next.timer, notifications: next.notifications,
      subjects: snapshot.shellOnly ? next.subjects : snapshot.subjects,
      shellPending: false };
    emit();
  } catch { /* The current shell remains usable during a transient connection failure. */ }
}
export function newId(): string { return crypto.randomUUID(); }
export function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval); }, []);
  return now;
}
