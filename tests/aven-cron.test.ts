import { afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/aven/scheduler", () => ({ runAvenScheduler: run }));
import { GET } from "@/app/api/cron/aven/route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("rejects cron callers without the configured bearer secret", async () => {
  vi.stubEnv("CRON_SECRET", "fixture-scheduler-secret-at-least-32-characters");
  expect(
    (await GET(new Request("https://acadence.example/api/cron/aven"))).status,
  ).toBe(401);
  expect(
    (
      await GET(
        new Request("https://acadence.example/api/cron/aven", {
          headers: { Authorization: "Bearer wrong" },
        }),
      )
    ).status,
  ).toBe(401);
  expect(run).not.toHaveBeenCalled();
});
it("runs authenticated jobs without requiring an OpenAI key", async () => {
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("CRON_SECRET", "fixture-scheduler-secret-at-least-32-characters");
  vi.stubEnv("OPENAI_API_KEY", "");
  run.mockResolvedValue({ ok: true, processed: 0, generated: 0 });
  const response = await GET(
    new Request("https://acadence.example/api/cron/aven", {
      headers: {
        Authorization: "Bearer fixture-scheduler-secret-at-least-32-characters",
      },
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).ok).toBe(true);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});
it("blocks authenticated staging jobs by default without invoking the scheduler", async () => {
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "staging");
  vi.stubEnv("NONPRODUCTION_JOBS_ENABLED", "false");
  vi.stubEnv("CRON_SECRET", "fixture-scheduler-secret-at-least-32-characters");
  const response = await GET(new Request("https://staging.example/api/cron/aven", {
    headers: { Authorization: "Bearer fixture-scheduler-secret-at-least-32-characters" },
  }));
  expect(response.status).toBe(403);
  expect(run).not.toHaveBeenCalled();
});
