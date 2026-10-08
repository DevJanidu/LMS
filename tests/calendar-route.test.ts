import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), range: vi.fn(), block: vi.fn(), mutate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://study.example" }) }));
vi.mock("@/lib/services/lists", async () => ({ ...(await vi.importActual("@/lib/services/lists")), getScheduleBlocksInRange: mocks.range }));
vi.mock("@/lib/services/calendar", async () => ({ ...(await vi.importActual("@/lib/services/calendar")), getCalendarBlock: mocks.block, mutateCalendar: mocks.mutate }));
import { GET, POST } from "@/app/api/calendar/route";
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "owner", role: "learner", timezone: "Asia/Colombo" });
  mocks.range.mockResolvedValue([]);
});
it("requires an active learner session on reads", async () => {
  mocks.user.mockResolvedValueOnce(null);
  expect((await GET(new Request("https://study.example/api/calendar?from=2026-10-05&to=2026-10-12"))).status).toBe(401);
  mocks.user.mockResolvedValueOnce({ role: "super_admin" });
  expect((await GET(new Request("https://study.example/api/calendar?from=2026-10-05&to=2026-10-12"))).status).toBe(403);
  expect(mocks.range).not.toHaveBeenCalled();
});
it("rejects excessive ranges and scopes valid reads to the authenticated user's timezone", async () => {
  expect((await GET(new Request("https://study.example/api/calendar?from=2020-01-01&to=2026-10-12"))).status).toBe(400);
  const response = await GET(new Request("https://study.example/api/calendar?from=2026-10-05&to=2026-10-12"));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(mocks.range).toHaveBeenCalledWith("owner", { from: "2026-10-05", to: "2026-10-12" }, "Asia/Colombo");
});
it("rejects foreign origins, malformed JSON and invalid mutation data", async () => {
  const request = (body: string, origin = "https://study.example") => new Request("https://study.example/api/calendar", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
  expect((await POST(request("{}", "https://attacker.example"))).status).toBe(403);
  expect((await POST(request("{"))).status).toBe(400);
  expect((await POST(request(JSON.stringify({ operationId: crypto.randomUUID(), command: { kind: "delete", scope: "all", id: "owner", date: "invalid" } })))).status).toBe(400);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
