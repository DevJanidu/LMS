import { afterEach, expect, it, vi } from "vitest";
import { optimisticOperations } from "@/lib/workspace/mutations";
import type { Workspace } from "@/types";
import { reconcileChanges } from "@/lib/workspace/confirmation";
import { matchesPrecondition, mutationPreconditions } from "@/lib/workspace/preconditions";
import { AuthenticationUnavailable, authenticationFailureKind, verifySession } from "@/lib/auth/errors";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("matches the database subject cascade instead of retaining orphan calendar blocks", () => {
  const data = { user: { id: "owner" }, subjects: [{ id: "parent" }], topics: [], resources: [], sessions: [], blocks: [{ id: "block", subjectId: "parent" }], timer: null } as unknown as Workspace;
  expect(optimisticOperations(data, [{ kind: "delete", entity: "subject", id: "parent" }]).blocks).toEqual([]);
});
it("clears a deleted topic from calendar exception overrides while preserving the plan", () => {
  const data = { user: { id: "owner" }, subjects: [], topics: [], resources: [], sessions: [], blocks: [{ id: "plan", topicId: "topic", exceptions: [{ date: "2026-01-01", cancelled: false, topicId: "topic", overrides: { topicId: "topic" } }] }], timer: null } as unknown as Workspace;
  const result = optimisticOperations(data, [{ kind: "delete", entity: "topic", id: "topic" }]);
  expect(result.blocks[0].topicId).toBeUndefined();
  expect(result.blocks[0].exceptions[0]).toMatchObject({ topicId: undefined, overrides: { topicId: null } });
});
it("removes deleted-subject exception overrides while retaining another subject's plan", () => {
  const data = { user: { id: "owner" }, subjects: [], topics: [], resources: [], sessions: [], blocks: [{ id: "plan", subjectId: "kept", exceptions: [{ date: "2026-01-01", cancelled: false, overrides: { subjectId: "removed" } }] }], timer: null } as unknown as Workspace;
  const result = optimisticOperations(data, [{ kind: "delete", entity: "subject", id: "removed" }]);
  expect(result.blocks[0]).toMatchObject({ subjectId: "kept", exceptions: [] });
});

it("does not share a pending authenticated read across account scopes", async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json({ ok: true, data: { rows: [], total: 0 } }));
  vi.stubGlobal("fetch", fetch);
  const { queryResources } = await import("@/lib/workspace/transport");
  // Scope is part of the transport contract, even for identical query inputs.
  await Promise.all([queryResources({}, "account-a"), queryResources({}, "account-b")]);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("starts a new read after mutation invalidation and does not let an old completion evict it", async () => {
  const pending: Array<(response: Response) => void> = [];
  const fetch = vi.fn(() => new Promise<Response>(resolve => pending.push(resolve)));
  vi.stubGlobal("fetch", fetch);
  const { queryResources, invalidateWorkspaceReads } = await import("@/lib/workspace/transport");
  const first = queryResources({}, "owner");
  invalidateWorkspaceReads();
  const second = queryResources({}, "owner");
  pending[0](Response.json({ ok: true, data: { rows: [], total: 0 } })); await first;
  const duplicate = queryResources({}, "owner");
  expect(fetch).toHaveBeenCalledTimes(2);
  pending[1](Response.json({ ok: true, data: { rows: [], total: 1 } }));
  expect(await second).toEqual(await duplicate);
});
it("replaces optimistic fields with authoritative rows, clears removed optional fields and preserves other pages", () => {
  const data = { resources: [{ id: "old", title: "Keep" }, { id: "new", title: " raw ", url: "https://old.example" }], subjects: [], topics: [], sessions: [], blocks: [], notifications: [], user: {} } as unknown as Workspace;
  const row = { id: "new", title: "raw", createdAt: "2026-10-09T00:00:00Z" } as Workspace["resources"][number];
  const result = reconcileChanges(data, { resources: [row] });
  expect(result.resources).toEqual([data.resources[0], row]);
  expect(result.resources[1]).not.toHaveProperty("url");
});
it("detects a stale paginated note edit without requiring a database schema migration", () => {
  const original = { id: "note", subjectId: "subject", type: "note", title: "Original", textContent: "Original content" } as Workspace["resources"][number];
  const data = { user: {}, resources: [], subjects: [], topics: [], sessions: [] } as unknown as Workspace;
  const [condition] = mutationPreconditions(data, [{ kind: "resource", value: { ...original, title: "Edited" } }], original);
  expect(matchesPrecondition(condition, original)).toBe(true);
  expect(matchesPrecondition(condition, { ...original, textContent: "Another tab" })).toBe(false);
  expect(matchesPrecondition(condition, undefined)).toBe(false);
});
it("preserves auth failure causes while diagnostics exclude exception text and credentials", () => {
  const cause = Object.assign(new Error("postgres://secret"), { code: "ECONNRESET" });
  const error = new AuthenticationUnavailable(cause);
  expect(error.cause).toBe(cause);
  expect(authenticationFailureKind(error)).toBe("connection");
  expect(authenticationFailureKind(new Error("secret"))).toBe("session_provider");
});
it("clears a confirmed optional profile field across JSON serialization", () => {
  const data = { user: { learningContext: "school" } } as Workspace;
  expect(reconcileChanges(data, JSON.parse(JSON.stringify({ profile: { learningContext: null } }))).user.learningContext).toBeUndefined();
});
it("recovers a transient session read once and never retries invalid or absent sessions", async () => {
  const read = vi.fn().mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "ECONNRESET" })).mockResolvedValueOnce({ user: "active" });
  expect(await verifySession(read)).toEqual({ user: "active" }); expect(read).toHaveBeenCalledTimes(2);
  const absent = vi.fn(async () => null); expect(await verifySession(absent)).toBeNull(); expect(absent).toHaveBeenCalledTimes(1);
  const invalid = vi.fn().mockRejectedValue(new Error("provider error"));
  await expect(verifySession(invalid)).rejects.toBeInstanceOf(AuthenticationUnavailable); expect(invalid).toHaveBeenCalledTimes(1);
});
