import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ policy: new Map<string, number>(), invalidated: vi.fn(), actor: { id: "11111111-1111-4111-8111-111111111111", status: "active", role: "super_admin", timezone: "UTC" } }));
vi.mock("@/lib/cache", () => ({ invalidateUser: vi.fn(), invalidateSettings: state.invalidated }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const tx = {
    select: () => ({ from: (table: unknown) => {
      const rows = () => table === schema.appSettings ? [...state.policy].map(([key, value]) => ({ key, value })) : [state.actor];
      const chain = { where: () => chain, orderBy: () => chain, for: async () => rows(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows()).then(resolve) };
      return chain;
    } }),
    insert: (table: unknown) => ({ values: (rows: Array<{ key: string; value: number }>) => table === schema.appSettings ? { onConflictDoUpdate: async () => { for (const row of rows) state.policy.set(row.key, row.value); } } : Promise.resolve([]) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ updatedAt: new Date("2026-10-10T00:00:00Z") }] }) }) }),
  };
  return { getDb: () => ({ transaction: async (work: (value: typeof tx) => Promise<void>) => work(tx) }) };
});
import { mutate } from "@/lib/services/mutations";
beforeEach(() => { state.policy = new Map(Object.entries({ streakMinutes: 10, maxFileSizeMB: 20, storagePerUserMB: 100, minimumAge: 18 })); vi.clearAllMocks(); });
it("confirms the persisted policy including an unchanged omitted setting", async () => {
  const result = await mutate(state.actor.id, [{ kind: "settings", value: { streakMinutes: 12, maxFileSizeMB: 10, storagePerUserMB: 100 } }]);
  expect(result.changes.settings).toEqual({ streakMinutes: 12, maxFileSizeMB: 10, storagePerUserMB: 100, minimumAge: 18 });
  expect(state.invalidated).toHaveBeenCalledOnce();
});
it("rejects a stale administrator policy before writing or invalidating", async () => {
  await expect(mutate(state.actor.id, [{ kind: "settings", value: { streakMinutes: 12, maxFileSizeMB: 10, storagePerUserMB: 100 } }], [{ kind: "settings", id: state.actor.id, values: { maxFileSizeMB: 5 } }])).rejects.toThrow("recordConflict");
  expect(state.policy.get("maxFileSizeMB")).toBe(20);
  expect(state.invalidated).not.toHaveBeenCalled();
});
