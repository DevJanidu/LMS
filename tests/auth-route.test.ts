import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allow: vi.fn(), post: vi.fn(), get: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { getSession: mocks.session } }) }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://study.example.com" }) }));
vi.mock("@/lib/rate-limit", () => ({ allowRequest: mocks.allow }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ POST: mocks.post, GET: mocks.get }) }));
import { GET, POST } from "@/app/api/auth/[...all]/route";
beforeEach(() => { vi.clearAllMocks(); mocks.allow.mockResolvedValue(true); mocks.post.mockResolvedValue(Response.json({ ok: true })); mocks.get.mockResolvedValue(Response.json({ ok: true })); });
it("rejects foreign origins and denied rate limits before credential processing", async () => {
  expect((await POST(new Request("https://study.example.com/api/auth/sign-in/email", { method: "POST", headers: { Origin: "https://attacker.example.com" } }))).status).toBe(403);
  expect(mocks.post).not.toHaveBeenCalled();
  mocks.allow.mockResolvedValue(false);
  expect((await POST(new Request("https://study.example.com/api/auth/sign-in/email", { method: "POST", headers: { Origin: "https://study.example.com" } }))).status).toBe(429);
  expect(mocks.post).not.toHaveBeenCalled();
});
it("protects every public credential route and prevents shared caching of auth responses", async () => {
  for (const path of ["sign-in/email", "sign-up/email", "request-password-reset", "reset-password"]) {
    const response = await POST(new Request(`https://study.example.com/api/auth/${path}`, { method: "POST", headers: { Origin: "https://study.example.com" } }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  }
  expect(mocks.allow).toHaveBeenCalledTimes(4);
  expect((await GET(new Request("https://study.example.com/api/auth/get-session"))).headers.get("cache-control")).toBe("private, no-store");
});
it("rejects deactivated sessions on library profile/session endpoints as well as LMS pages", async () => {
  mocks.session.mockResolvedValue({ user: { status: "deactivated" } });
  const request = new Request("https://study.example.com/api/auth/update-user", { method: "POST", headers: { Origin: "https://study.example.com" } });
  expect((await POST(request)).status).toBe(401);
  expect(mocks.post).not.toHaveBeenCalled();
  expect((await GET(new Request("https://study.example.com/api/auth/list-sessions"))).status).toBe(401);
  mocks.get.mockResolvedValue(Response.json({ user: { status: "deactivated" }, session: { id: "fixture" } }));
  expect(await (await GET(new Request("https://study.example.com/api/auth/get-session"))).json()).toBeNull();
});
