import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { currentWorkspaceTheme, runOperation } from "@/lib/workspace/store";
import type { Workspace } from "@/types";

function workspace(): Workspace {
  return { user: { id: crypto.randomUUID(), email: "audit-fixture@example.com", status: "active", createdAt: "2026-01-01T00:00:00Z", lastActiveAt: "2026-01-01T00:00:00Z", longestStreak: 0, theme: "auto", updatedAt: "2026-01-01T00:00:00Z", role: "learner", name: "Fixture", timezone: "UTC", weeklyTargetMinutes: 0, weekStartDay: 1, reminders: true }, subjects: [], topics: [], resources: [], sessions: [], blocks: [], notifications: [], users: [], auditLogs: [], settings: { streakMinutes: 10, maxFileSizeMB: 10, storagePerUserMB: 100 }, timer: null };
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("retains newer theme edits when an earlier save fails and restores confirmed state if both fail", async () => {
  const initial = workspace(), first = deferred(), second = deferred();
  const fetch = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
  vi.stubGlobal("fetch", fetch);
  const a = runOperation(initial, { kind: "profile", value: { ...initial.user, learningContext: "school", theme: "dark" } });
  const b = runOperation(initial, { kind: "profile", value: { ...initial.user, learningContext: "school", theme: "light" } });
  expect(currentWorkspaceTheme(initial)).toBe("light");
  first.resolve(Response.json({ ok: false, error: "saveFailed" })); await a;
  expect(currentWorkspaceTheme(initial)).toBe("light");
  second.resolve(Response.json({ ok: false, error: "saveFailed" })); await b;
  expect(currentWorkspaceTheme(initial)).toBe("auto");
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("shares duplicate writes and isolates the projection between accounts", async () => {
  const initial = workspace(), response = deferred();
  const fetch = vi.fn(() => response.promise); vi.stubGlobal("fetch", fetch);
  const operation = { kind: "profile" as const, value: { ...initial.user, learningContext: "school" as const, theme: "dark" as const } };
  const first = runOperation(initial, operation), second = runOperation(initial, operation);
  expect(currentWorkspaceTheme(workspace())).toBe("auto");
  response.resolve(Response.json({ ok: true, userUpdatedAt: "2026-01-02T00:00:00Z" }));
  expect((await first).ok).toBe(true); expect((await second).ok).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(currentWorkspaceTheme(initial)).toBe("dark");
});
it("does not let an old account-scope completion evict a newer duplicate request", async () => {
  const a = workspace(), b = workspace(), old = deferred(), current = deferred();
  const fetch = vi.fn().mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(Response.json({ ok: true, userUpdatedAt: "2026-01-02T00:00:00Z" }))
    .mockReturnValueOnce(current.promise);
  vi.stubGlobal("fetch", fetch);
  const operation = { kind: "profile" as const, value: { ...a.user, learningContext: "school" as const, theme: "dark" as const } };
  const first = runOperation(a, operation);
  await runOperation(b, { kind: "profile", value: { ...b.user, learningContext: "school", theme: "light" } });
  const second = runOperation(a, operation);
  old.resolve(Response.json({ ok: true, userUpdatedAt: "2026-01-02T00:00:00Z" })); await first;
  const duplicate = runOperation(a, operation);
  current.resolve(Response.json({ ok: true, userUpdatedAt: "2026-01-03T00:00:00Z" }));
  await Promise.all([second, duplicate]);
  expect(fetch).toHaveBeenCalledTimes(3);
});
