import { afterEach, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ getEnv: vi.fn() }));
vi.mock("@/lib/env", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/env")>(), getEnv: mocked.getEnv }));
import { register } from "@/instrumentation";
import { InvalidServerConfiguration } from "@/lib/env";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("keeps public pages available and logs only missing setting names on startup", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("APP_ENV", "production"); vi.stubEnv("NEXT_PHASE", "phase-production-server");
  mocked.getEnv.mockImplementation(() => { throw new InvalidServerConfiguration("private secret value", ["AUTH_SECRET", "RESEND_API_KEY"]); });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(register()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledExactlyOnceWith('{"event":"startup_configuration_invalid","fields":["AUTH_SECRET","RESEND_API_KEY"]}');
  expect(() => mocked.getEnv()).toThrow(InvalidServerConfiguration);
});
it("does not validate runtime-only configuration during the production build", async () => {
  vi.stubEnv("NEXT_RUNTIME", "nodejs"); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PHASE", "phase-production-build");
  await register();
  expect(mocked.getEnv).not.toHaveBeenCalled();
});
