import { beforeEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ config: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/env", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/env")>(), getAccountEnv: mocked.config }));
vi.mock("@/lib/db", () => ({ getDb: () => ({ execute: mocked.execute }) }));
import { GET } from "@/app/api/health/route";
import { InvalidServerConfiguration } from "@/lib/env";
beforeEach(() => { vi.resetAllMocks(); mocked.config.mockReturnValue({}); mocked.execute.mockResolvedValue({ rows: [{ reachable: 1 }] }); });
it("reports readiness when account configuration and database are healthy", async () => {
  expect(await (await GET()).json()).toEqual({ ok: true });
});
it("identifies invalid core settings without exposing their values", async () => {
  mocked.config.mockImplementation(() => { throw new InvalidServerConfiguration("private signing secret and connection URL", ["AUTH_SECRET", "APP_URL"]); });
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false, invalidFields: ["AUTH_SECRET", "APP_URL"] });
  expect(mocked.execute).not.toHaveBeenCalled();
});
it("does not return database error messages or credentials", async () => {
  mocked.execute.mockRejectedValue(new Error("private database connection URL"));
  expect(await (await GET()).json()).toEqual({ ok: false });
});
