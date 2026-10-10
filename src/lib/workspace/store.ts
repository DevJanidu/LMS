"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { MutationJournal, mutationKeys, optimisticOperations } from "./mutations";
import type { Workspace } from "@/types";
import type { Operation } from "@/lib/validation/operations";
import { reconcileChanges, type MutationConfirmation as Confirmation, type WorkspaceChanges } from "./confirmation";
import { invalidateWorkspaceReads } from "./transport";
import { beginWrite } from "./write-status";
import { mutationPreconditions, type OriginalRecord } from "./preconditions";
let snapshot: Workspace | undefined;
let error = "";
let pending = 0;
let journal: MutationJournal<Workspace> | undefined;
let journalUser: string | undefined;
const duplicates = new Map<string, Promise<Confirmation>>();
const dirtyGroups = new Set<string>();
let operationSequence = 0;
const collectionLayers = new Map<number, { input: Operation[]; now: number; pending: boolean; changes?: WorkspaceChanges }>();
const collectionReaders = new Map<object, number>();
function pruneCollectionLayers() {
  const observed = collectionReaders.size ? Math.min(...collectionReaders.values()) : operationSequence;
  for (const [sequence, layer] of collectionLayers) if (!layer.pending && sequence <= observed) collectionLayers.delete(sequence);
}
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let failedMutation: { initial: Workspace; input: Operation[] } | undefined;
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
function missingPageFields(current: Workspace, next: Workspace) {
  return (next.pageFields ?? []).filter(field => !["user", "settings", "timer"].includes(field) && !current.pageFields?.includes(field));
}
function requestMissingFields(fields: NonNullable<Workspace["pageFields"]>) {
  for (const field of fields) {
    if (["subjects", "topics", "subjectStatistics"].includes(field)) dirtyGroups.add("subjects");
    if (["resources", "resourceCounts", "storageBytes"].includes(field)) dirtyGroups.add("resources");
    if (field === "sessions") dirtyGroups.add("sessions");
    if (field === "analytics") dirtyGroups.add("analytics");
    if (field === "blocks") dirtyGroups.add("blocks");
  }
  void refreshSnapshot();
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
    const stale = sameScope && (Date.parse(initial.user.updatedAt) < Date.parse(snapshot!.user.updatedAt)
      || (initial.user.updatedAt === snapshot!.user.updatedAt && Boolean(initial.loadedAt && snapshot!.loadedAt && initial.loadedAt < snapshot!.loadedAt)));
    if (!stale && (!initial.shellOnly || !snapshot || snapshot.user.id !== initial.user.id)) {
      revision++;
      const store = ensureJournal(initial);
      store.replace(current => initial.pageFields ? mergePage(current, initial) : initial);
      error = "";
    } else if (sameScope && initial.pageFields && missingPageFields(snapshot!, initial).length) {
      requestMissingFields(missingPageFields(snapshot!, initial));
    }
    if (stale && initial.platform && !snapshot?.platform) { dirtyGroups.add("platform"); void refreshSnapshot(); }
    appliedInitial.current = initial;
    emit();
  }, [initial]);
  useEffect(() => {
    mounts++;
    if (!cleanupPoll) {
      const refresh = () => { if (!pending && document.visibilityState === "visible") void refreshShellSnapshot(); };
      const interval = setInterval(() => { void refresh(); }, 30000);
      window.addEventListener("focus", refresh);
      window.addEventListener("online", refresh);
      cleanupPoll = () => { clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
    }
    return () => { mounts--; if (!mounts) { cleanupPoll?.(); cleanupPoll = undefined; } };
  }, []);
  return useSyncExternalStore(subscribe,
    () => initial.pageFields && appliedInitial.current !== initial && !(snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope && (snapshot.user.updatedAt > initial.user.updatedAt || (snapshot.loadedAt && initial.loadedAt && snapshot.loadedAt > initial.loadedAt && !missingPageFields(snapshot, initial).length))) ? initial :
      snapshot?.user.id === initial.user.id && (initial.shellOnly || snapshot.scope === initial.scope) ? snapshot : initial,
    () => initial);
}
/** Apply streamed shell details only while a feature page has not supplied fresher data. */
export function hydrateShellWorkspace(next: Workspace) {
  if (pending) return;
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
  journal?.replace(() => snapshot!);
}
/** Apply a range or filter read without replacing the authenticated shell. */
export function hydratePageFields(initial: Workspace, fields: Partial<Workspace>) {
  if (!snapshot || snapshot.user.id !== initial.user.id || snapshot.scope !== initial.scope || pending) return;
  revision++;
  snapshot = { ...snapshot, ...fields };
  journal?.replace(() => snapshot!);
  emit();
}
export function useStorageError(): boolean { return Boolean(useWorkspaceError()); }
/** Read the latest projection after a save settles, including newer queued edits. */
export function currentWorkspaceTheme(initial: Workspace) {
  return snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot.user.theme : initial.user.theme;
}
export function useWorkspaceError() { return useSyncExternalStore(subscribe, () => error, () => ""); }
export function useWorkspaceRetryable() { return useSyncExternalStore(subscribe, () => Boolean(error === "saveFailed" && failedMutation && !failedMutation.input.some(operation => ["timer", "userStatus", "settings"].includes(operation.kind))), () => false); }
export function useWorkspacePending(key?: string) { return useSyncExternalStore(subscribe, () => journal?.pending(key) ?? false, () => false); }
export function useUnconfirmedSubject(id: string) { return useSyncExternalStore(subscribe, () => Boolean(journal?.pending(`subject:${id}`) && !journal.confirmed.subjects.some(subject => subject.id === id)), () => false); }
function ensureJournal(initial: Workspace) {
  if (!journal || journalUser !== `${initial.user.id}:${initial.scope}`) {
    journalUser = `${initial.user.id}:${initial.scope}`;
    invalidateWorkspaceReads();
    duplicates.clear(); dirtyGroups.clear(); pending = 0; failedMutation = undefined;
    collectionLayers.clear(); operationSequence = 0;
    const created = new MutationJournal(snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot : initial, data => {
      if (journal !== created) return;
      snapshot = data; emit();
    });
    journal = created;
  }
  return journal;
}
function invalidateOperations(input: Operation[], data: Workspace) {
  for (const operation of input) {
    if (["profile", "settings", "readNotification", "timer"].includes(operation.kind)) dirtyGroups.add("shell");
    if (["subject", "topic", "session"].includes(operation.kind) || (operation.kind === "delete" && ["subject", "topic", "session"].includes(operation.entity))) dirtyGroups.add("subjects");
    if (operation.kind === "resource" || (operation.kind === "delete" && ["resource", "subject", "topic"].includes(operation.entity))) dirtyGroups.add("resources");
    if (operation.kind === "session" || (operation.kind === "timer" && operation.value.command === "finish") || (operation.kind === "delete" && ["session", "subject"].includes(operation.entity))) dirtyGroups.add("sessions");
    if (operation.kind === "block" || (operation.kind === "delete" && ["block", "subject", "topic"].includes(operation.entity))) dirtyGroups.add("blocks");
    if (data.analytics && (["session", "topic", "subject"].includes(operation.kind) || (operation.kind === "timer" && operation.value.command === "finish") || (operation.kind === "delete" && ["subject", "topic", "session"].includes(operation.entity)))) dirtyGroups.add("analytics");
  }
  if (data.user.role === "admin") { dirtyGroups.clear(); dirtyGroups.add("shell"); if (data.platform) dirtyGroups.add("platform"); }
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void refreshSnapshot(); }, 150);
}
function sendOperations(initial: Workspace, input: Operation[], original?: OriginalRecord) {
  const store = ensureJournal(initial);
  const token = `${initial.user.id}:${JSON.stringify(input)}`;
  const existing = duplicates.get(token);
  if (existing) return existing;
  const now = Date.now();
  if (snapshot && input.some(operation => operation.kind === "profile" && (operation.value.timezone !== snapshot!.user.timezone || operation.value.weekStartDay !== snapshot!.user.weekStartDay))) dirtyGroups.add("analytics");
  const sequence = ++operationSequence;
  collectionLayers.set(sequence, { input, now, pending: true });
  invalidateWorkspaceReads();
  const finishWrite = beginWrite(initial.user.id);
  revision++; pending++;
  if (!failedMutation || mutationKeys(failedMutation.input).some(key => mutationKeys(input).includes(key))) { error = ""; failedMutation = undefined; }
  const task = store.submit(mutationKeys(input, snapshot ?? initial), data => optimisticOperations(data, input, now), async () => {
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operations: input, preconditions: mutationPreconditions(store.confirmed, input, original) }), signal: AbortSignal.timeout(30000) });
      const result = await response.json() as Confirmation;
      if (!response.ok || result.ok !== true) result.ok = false;
      if (result.uncertain || (response.status >= 500 && result.uncertain !== false)) { result.uncertain = true; result.error = "saveUncertain"; }
      finishWrite(result.ok ? "saved" : result.uncertain ? "uncertain" : "failed");
      if (!result.ok && journal === store) { error = result.error ?? "saveFailed"; failedMutation = result.uncertain ? undefined : { initial, input }; collectionLayers.delete(sequence); }
      else if (journal === store) { const layer = collectionLayers.get(sequence)!; layer.pending = false; layer.changes = result.changes; }
      return result;
    } catch { finishWrite("uncertain"); if (journal === store) { error = "saveUncertain"; failedMutation = undefined; collectionLayers.delete(sequence); } return { ok: false, error: "saveUncertain", uncertain: true }; }
  }, result => result.ok, (data, result) => {
    const changes = result.userUpdatedAt && result.userUpdatedAt < data.user.updatedAt ? { ...result.changes, profile: undefined } : result.changes;
    const next = reconcileChanges(data, changes);
    return { ...next, user: { ...next.user, updatedAt: result.userUpdatedAt && result.userUpdatedAt > data.user.updatedAt ? result.userUpdatedAt : data.user.updatedAt } };
  })
    .finally(() => {
      if (duplicates.get(token) === task) duplicates.delete(token);
      if (journal !== store) return;
      invalidateWorkspaceReads();
      pending--; pruneCollectionLayers(); invalidateOperations(input, snapshot ?? initial); emit();
    });
  duplicates.set(token, task);
  return task;
}
export function updateWorkspace(initial: Workspace, change: (data: Workspace) => Workspace, original?: OriginalRecord): Promise<boolean> {
  const before = snapshot?.user.id === initial.user.id && snapshot.scope === initial.scope ? snapshot : initial;
  const after = change(before);
  const input = operations(before, after) as Operation[];
  if (!input.length) return Promise.resolve(true);
  return sendOperations(initial, input, original).then(result => result.ok);
}
export function runOperation(initial: Workspace, operation: Operation, original?: OriginalRecord) {
  return sendOperations(initial, [operation], original).then(result => result.ok ? { ok: true as const, timerResult: result.timerResult } : { ok: false as const, error: result.error ?? "saveFailed" });
}
/** Explicit retries reuse creation UUIDs; timer/security actions require a fresh confirmation. */
export function retryWorkspaceMutation() {
  const failed = failedMutation;
  if (!failed || failed.input.some(operation => ["timer", "userStatus", "settings"].includes(operation.kind))) return;
  failedMutation = undefined;
  return sendOperations(failed.initial, failed.input);
}
/** A read can acknowledge only writes confirmed before it started. */
export function collectionRevision() {
  const inflight = [...collectionLayers].filter(([, layer]) => layer.pending).map(([id]) => id);
  return inflight.length ? Math.min(...inflight) - 1 : operationSequence;
}
export function projectCollection<K extends "resources" | "sessions" | "users">(field: K, rows: Workspace[K], observed: number): Workspace[K] {
  if (!snapshot) return rows;
  let data = { ...snapshot, [field]: rows };
  for (const [sequence, layer] of collectionLayers) if (sequence > observed) data = reconcileChanges(optimisticOperations(data, layer.input, layer.now), layer.changes);
  return data[field];
}
export function useProjectedCollection<K extends "resources" | "sessions" | "users">(field: K, rows: Workspace[K], observed: number): Workspace[K] {
  const reader = useRef({});
  useEffect(() => {
    const key = reader.current;
    collectionReaders.set(key, 0);
    return () => { collectionReaders.delete(key); pruneCollectionLayers(); };
  }, []);
  useEffect(() => {
    collectionReaders.set(reader.current, observed); pruneCollectionLayers();
  }, [observed]);
  return projectCollection(field, rows, observed);
}
export async function flushWorkspace() { await journal?.flush(); return !error; }
async function refreshSnapshot() {
  if (refreshing || pending || !snapshot || !dirtyGroups.size) return;
  const observed = revision, store = journal;
  const groups = [...dirtyGroups]; dirtyGroups.clear();
  let superseded = false;
  refreshing = (async () => {
    try {
      const response = await fetch(`/api/workspace?groups=${groups.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!result.ok) throw new Error("saveFailed");
      if (journal === store && revision === observed) store?.replace(data => {
        if (result.fields.user && result.fields.user.updatedAt > data.user.updatedAt && data.user.role === "learner") {
          if (data.pageFields?.includes("subjects")) dirtyGroups.add("subjects");
          if (data.pageFields?.includes("resources")) dirtyGroups.add("resources");
          if (data.pageFields?.includes("sessions")) dirtyGroups.add("sessions");
          if (data.analytics) dirtyGroups.add("analytics");
          superseded = true;
        }
        return { ...data, ...result.fields, pageFields: [...new Set([...(data.pageFields ?? []), ...Object.keys(result.fields).filter(field => !["notifications"].includes(field))])] as Workspace["pageFields"], loadedAt: new Date().toISOString() };
      });
      else if (journal === store) { superseded = true; groups.forEach(group => dirtyGroups.add(group)); }
    } catch { if (journal === store) groups.forEach(group => dirtyGroups.add(group)); }
  })();
  try { await refreshing; } finally {
    refreshing = undefined;
    if (superseded && !pending) syncTimer = setTimeout(() => { void refreshSnapshot(); }, 150);
    // Retry transient read failures in the normal focus/poll cycle, not a tight loop.
  }
}
export async function reloadWorkspace() { dirtyGroups.add("resources"); await refreshSnapshot(); }
/** Uploads have a separate binary transport but share cache reconciliation. */
export function confirmWorkspaceChanges(initial: Workspace, confirmation: Confirmation) {
  if (!confirmation.ok) return;
  const store = ensureJournal(initial);
  revision++; invalidateWorkspaceReads();
  store.replace(data => {
    const next = reconcileChanges(data, confirmation.changes);
    return { ...next, user: { ...next.user, updatedAt: confirmation.userUpdatedAt && confirmation.userUpdatedAt > data.user.updatedAt ? confirmation.userUpdatedAt : data.user.updatedAt } };
  });
  dirtyGroups.add("resources"); void refreshSnapshot();
}
async function refreshShellSnapshot() {
  dirtyGroups.add("shell"); await refreshSnapshot();
}
export function newId(): string { return crypto.randomUUID(); }
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => { const tick = () => setNow(Date.now()); tick(); const interval = setInterval(tick, intervalMs); return () => clearInterval(interval); }, [intervalMs]);
  return now;
}
