"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { mutateWorkspace, refreshWorkspace } from "@/app/[locale]/actions";
import type { Workspace } from "@/types";
import type { Operation } from "@/lib/validation/operations";
import { operationsSchema } from "@/lib/validation/operations";
let snapshot: Workspace | undefined;
let error = "";
let pending = 0;
let queue: Promise<unknown> = Promise.resolve();
let mounts = 0;
let cleanupPoll: (() => void) | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const emit = () => listeners.forEach(listener => listener());
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

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
  useEffect(() => {
    if (!pending) { snapshot = initial; error = ""; emit(); }
  }, [initial]);
  useEffect(() => {
    mounts++;
    if (!cleanupPoll) {
      const refresh = async () => { if (!pending) { try { const next = await refreshWorkspace(); if (!pending) { snapshot = next; emit(); } } catch { error = "saveFailed"; emit(); } } };
      const interval = setInterval(() => { void refresh(); }, 30000);
      window.addEventListener("focus", refresh);
      cleanupPoll = () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
    }
    return () => { mounts--; if (!mounts) { cleanupPoll?.(); cleanupPoll = undefined; } };
  }, []);
  return useSyncExternalStore(subscribe, () => snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot : initial, () => initial);
}
export function useStorageError(): boolean { return Boolean(useWorkspaceError()); }
export function useWorkspaceError() { return useSyncExternalStore(subscribe, () => error, () => ""); }
export function updateWorkspace(initial: Workspace, change: (data: Workspace) => Workspace): Promise<boolean> {
  const before = snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot : initial;
  const after = change(before);
  const input = operations(before, after);
  if (!input.length) return Promise.resolve(true);
  if (!operationsSchema.safeParse(input).success) { error = "invalidInput"; emit(); return Promise.resolve(false); }
  snapshot = after; pending++; error = ""; emit();
  const task = queue.then(async () => {
    try {
      const result = await mutateWorkspace(input);
      if (!result.ok) { error = result.error; snapshot = await refreshWorkspace(); return false; }
      if (pending === 1) snapshot = result.data;
      return true;
    } catch { error = "saveFailed"; snapshot = before; return false; }
    finally { pending--; emit(); }
  });
  queue = task;
  return task;
}
export function runOperation(initial: Workspace, operation: Operation) {
  const parsed = operationsSchema.safeParse([operation]);
  if (!parsed.success) { error = "invalidInput"; emit(); return Promise.resolve({ ok: false as const, error }); }
  const task = queue.then(async () => {
    pending++; error = ""; emit();
    try {
      const result = await mutateWorkspace(parsed.data);
      if (result.ok) snapshot = result.data;
      else error = result.error;
      return result;
    } catch { error = "saveFailed"; snapshot ??= initial; return { ok: false as const, error }; }
    finally { pending--; emit(); }
  });
  queue = task;
  return task;
}
export async function flushWorkspace() { await queue; return !error; }
export async function reloadWorkspace() { await queue; snapshot = await refreshWorkspace(); emit(); }
export function newId(): string { return crypto.randomUUID(); }
export function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const interval = setInterval(tick, 1000); return () => clearInterval(interval); }, []);
  return now;
}
