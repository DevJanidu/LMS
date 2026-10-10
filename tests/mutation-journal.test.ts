import { describe, expect, it } from "vitest";
import { MutationJournal, mutationKeys, optimisticOperations } from "../src/lib/workspace/mutations";
import type { Workspace } from "../src/types";

function workspace(): Workspace {
  return { user: { id: "owner" }, subjects: [], topics: [{ id: "topic", subjectId: "subject" }], resources: [{ id: "note", subjectId: "subject", topicId: "topic" }], sessions: [], blocks: [], notifications: [], users: [], auditLogs: [], settings: {}, timer: null } as unknown as Workspace;
}

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("shared mutation journal", () => {
  it("does not let a browser clock replace the server account revision", () => {
    const data = workspace();
    data.user.updatedAt = "2026-01-01T00:00:00Z";
    const value = { ...data.user, learningContext: "school" as const, name: "Updated", updatedAt: "2099-01-01T00:00:00Z" };
    expect(optimisticOperations(data, [{ kind: "profile", value }]).user).toMatchObject({ name: "Updated", updatedAt: data.user.updatedAt });
  });
  it("orders child deletion, reassignment and timer commands with their dependencies", () => {
    const data = workspace();
    expect(mutationKeys([{ kind: "delete", entity: "resource", id: "note" }], data)).toEqual(["resource:note", "subject:subject", "topic:topic"]);
    expect(mutationKeys([{ kind: "resource", value: { id: "note", subjectId: "other", topicId: "other-topic", type: "note", title: "Moved" } }], data)).toEqual(["resource:note", "subject:subject", "topic:topic", "subject:other", "topic:other-topic"]);
    expect(mutationKeys([{ kind: "timer", value: { command: "start", subjectId: "subject", topicId: "topic" } }], data)).toEqual(["timer", "subject:subject", "topic:topic"]);
    data.timer = { subjectId: "subject", topicId: "topic", startedAt: "2026-01-01T10:00:00Z", pausedTotalSeconds: 0, confirmedUntilSeconds: 21600 };
    expect(mutationKeys([{ kind: "delete", entity: "subject", id: "subject" }], data)).toContain("timer");
  });
  it("derives session display fields from validated intervals and retains paused timer time", () => {
    const data = workspace();
    const value = { id: "session", subjectId: "subject", startedAt: "2026-01-01T10:00:00Z", endedAt: "2026-01-01T11:00:00Z" };
    const created = optimisticOperations(data, [{ kind: "session", value }]);
    expect(created.sessions[0]).toMatchObject({ durationSeconds: 3600, status: "valid", source: "manual" });
    created.sessions[0] = { ...created.sessions[0], source: "timer", durationSeconds: 1800 };
    const edited = optimisticOperations(created, [{ kind: "session", value: { ...value, note: "Edited note" } }]);
    expect(edited.sessions[0]).toMatchObject({ durationSeconds: 1800, source: "timer", note: "Edited note" });
    expect(optimisticOperations(edited, [{ kind: "session", value: { ...value, endedAt: "2026-01-01T12:00:00Z" } }]).sessions[0]).toMatchObject({ durationSeconds: 7200, source: "manual" });
  });
  it("starts unrelated writes concurrently and rolls back only the failed record", async () => {
    const first = deferred<boolean>(), second = deferred<boolean>();
    const seen: string[] = [];
    const journal = new MutationJournal({ a: 0, b: 0 }, () => undefined);
    const a = journal.submit(["a"], data => ({ ...data, a: 1 }), () => { seen.push("a"); return first.promise; }, Boolean);
    const b = journal.submit(["b"], data => ({ ...data, b: 2 }), () => { seen.push("b"); return second.promise; }, Boolean);
    expect(journal.value).toEqual({ a: 1, b: 2 });
    await Promise.resolve(); expect(seen).toEqual(["a", "b"]);
    second.resolve(true); await b; first.resolve(false); await a;
    expect(journal.value).toEqual({ a: 0, b: 2 });
    expect(journal.pending()).toBe(false);
  });
  it("serializes a shared record while preserving the newest optimistic state", async () => {
    const first = deferred<boolean>(); let dispatched = false;
    const journal = new MutationJournal({ title: "old" }, () => undefined);
    const a = journal.submit(["subject:1"], data => ({ ...data, title: "first" }), () => first.promise, Boolean);
    const b = journal.submit(["subject:1"], data => ({ ...data, title: "second" }), async () => { dispatched = true; return true; }, Boolean);
    expect(journal.value.title).toBe("second");
    await Promise.resolve(); expect(dispatched).toBe(false);
    first.resolve(false); await a; await b;
    expect(journal.value.title).toBe("second");
  });
  it("overlays pending changes on background reads and releases rejected requests", async () => {
    const write = deferred<boolean>();
    const journal = new MutationJournal({ a: 0, b: 0 }, () => undefined);
    const task = journal.submit(["a"], data => ({ ...data, a: 1 }), () => write.promise, Boolean);
    journal.replace(data => ({ ...data, b: 9 }));
    expect(journal.value).toEqual({ a: 1, b: 9 });
    write.resolve(false); await task;
    await expect(journal.submit(["a"], data => ({ ...data, a: 2 }), async () => { throw new Error("offline"); }, Boolean)).rejects.toThrow("offline");
    expect(journal.value).toEqual({ a: 0, b: 9 });
    expect(journal.pending("a")).toBe(false);
  });
});
