import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ pools: [] as EventEmitter[], drizzle: vi.fn(() => ({ fixture: true })) }));
vi.mock("@neondatabase/serverless", () => ({
  neonConfig: {},
  Pool: class extends EventEmitter { constructor() { super(); mocked.pools.push(this); } },
}));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: mocked.drizzle }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ DATABASE_URL: "postgresql://fixture:fixture@database.example.com/app" }) }));
import { getDb } from "@/lib/db";

it("handles idle pool disconnects without throwing or exposing error contents and reuses the pool", () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const database = getDb();
    const pool = mocked.pools[0];
    expect(() => pool.emit("error", new Error("private connection URL and password"))).not.toThrow();
    expect(warning).toHaveBeenCalledExactlyOnceWith('{"event":"database_pool_connection_failed"}');
    expect(pool.eventNames()).toEqual(["error"]);
    expect(getDb()).toBe(database);
    expect(mocked.pools).toHaveLength(1);
  } finally { warning.mockRestore(); }
});
