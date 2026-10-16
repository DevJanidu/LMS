import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ allow: vi.fn(), post: vi.fn(), get: vi.fn(), session: vi.fn(), getEnv: vi.fn() }));
// Mirrors readActiveSession: only active sessions count as signed in.
vi.mock("@/lib/auth", () => ({ getAuth: () => ({}), readActiveSession: async () => { const session = await mocks.session(); return session?.user?.status === "active" ? session : null; } }));
vi.mock("@/lib/env", () => ({ getAccountEnv: mocks.getEnv }));
vi.mock("@/lib/auth/limits", () => ({ requestAuthLimit: async (...args: unknown[]) => await mocks.allow(...args) ? "allowed" : "limited" }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ POST: mocks.post, GET: mocks.get }) }));
import { GET, POST } from "@/app/api/auth/[...all]/route";
const origin = "https://study.example.com";
const post = (path: string, headers: Record<string, string> = { Origin: origin }) => POST(new Request(`${origin}/api/auth/${path}`, { method: "POST", headers }));
const get = (path: string, headers: Record<string, string> = {}) => GET(new Request(`${origin}/api/auth/${path}`, { headers }));
const active = { user: { id: "00000000-0000-4000-8000-000000000001", status: "active", role: "learner" }, session: { id: "fixture", createdAt: new Date().toISOString() } };
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); mocks.getEnv.mockReturnValue({ APP_URL: origin }); mocks.allow.mockResolvedValue(true); mocks.session.mockResolvedValue(null); mocks.post.mockResolvedValue(Response.json({ ok: true })); mocks.get.mockResolvedValue(Response.json({ ok: true })); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("rejects foreign origins and denied rate limits before starting Google sign-in", async () => {
  expect((await post("sign-in/social", { Origin: "https://attacker.example.com" })).status).toBe(403);
  expect((await post("sign-in/social", {})).status).toBe(403);
  expect(mocks.post).not.toHaveBeenCalled();
  mocks.allow.mockResolvedValue(false);
  expect((await post("sign-in/social")).status).toBe(429);
  expect(mocks.post).not.toHaveBeenCalled();
});
it("opens only the Google sign-in, callback and sign-out endpoints to signed-out visitors", async () => {
  expect((await post("sign-in/social")).status).toBe(200);
  expect((await post("sign-out")).status).toBe(200);
  expect((await get("callback/google?code=fixture&state=fixture")).status).toBe(200);
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it("rate-limits the OAuth callback per client address", async () => {
  mocks.allow.mockResolvedValue(false);
  expect((await get("callback/google?code=fixture&state=fixture")).status).toBe(429);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.allow).toHaveBeenCalledWith("auth-callback:direct", 30);
});
it("trusts forwarding headers only on Vercel, so a spoofed address cannot open a fresh bucket", async () => {
  await post("sign-in/social", { Origin: origin, "x-forwarded-for": "203.0.113.9" });
  expect(mocks.allow).toHaveBeenLastCalledWith("auth-route:direct", 30);
  vi.stubEnv("VERCEL", "1");
  await post("sign-in/social", { Origin: origin, "x-vercel-forwarded-for": "198.51.100.7", "x-forwarded-for": "203.0.113.9" });
  expect(mocks.allow).toHaveBeenLastCalledWith("auth-route:198.51.100.7", 30);
  await post("sign-in/social", { Origin: origin, "x-forwarded-for": "not-an-ip" });
  expect(mocks.allow).toHaveBeenLastCalledWith("auth-route:unknown", 30);
});
it("closes password, reset, verification, profile, linking and token endpoints to everyone", async () => {
  const closed = ["sign-in/email", "sign-up/email", "request-password-reset", "forget-password", "reset-password", "verify-email", "update-user", "change-email", "delete-user", "link-social", "unlink-account", "get-access-token", "refresh-token"];
  for (const session of [null, active]) {
    mocks.session.mockResolvedValue(session);
    for (const path of closed) {
      const response = await post(path);
      expect(response.status, path).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    for (const path of ["reset-password/fixture-token", "verify-email?token=fixture", "error", "list-accounts", "account-info"]) expect((await get(path)).status, path).toBe(404);
  }
  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.get).not.toHaveBeenCalled();
});
it("lets signed-in users manage their own sessions and nothing else", async () => {
  expect((await post("revoke-other-sessions")).status).toBe(401);
  expect((await get("list-sessions")).status).toBe(401);
  mocks.session.mockResolvedValue(active);
  for (const path of ["revoke-session", "revoke-sessions", "revoke-other-sessions"]) expect((await post(path)).status, path).toBe(200);
  expect((await get("list-sessions")).status).toBe(200);
});
it("prevents shared caching of auth responses", async () => {
  expect((await post("sign-in/social")).headers.get("cache-control")).toBe("private, no-store");
  expect((await get("get-session")).headers.get("cache-control")).toBe("private, no-store");
});
it("treats deactivated users and sessions past their absolute lifetime as signed out", async () => {
  mocks.session.mockResolvedValue({ user: { status: "deactivated" } });
  expect((await post("revoke-sessions")).status).toBe(401);
  expect(mocks.post).not.toHaveBeenCalled();
  expect((await get("list-sessions")).status).toBe(401);
  mocks.get.mockResolvedValue(Response.json({ user: { status: "deactivated", role: "learner" }, session: { id: "fixture", createdAt: new Date().toISOString() } }));
  expect(await (await get("get-session")).json()).toBeNull();
  mocks.get.mockResolvedValue(Response.json({ user: { status: "active", role: "super_admin" }, session: { id: "fixture", createdAt: new Date(Date.now() - 13 * 3_600_000).toISOString() } }));
  expect(await (await get("get-session")).json()).toBeNull();
  mocks.get.mockResolvedValue(Response.json({ user: { status: "active", role: "learner" }, session: { id: "fixture", createdAt: new Date(Date.now() - 13 * 3_600_000).toISOString() } }));
  expect(await (await get("get-session")).json()).toMatchObject({ user: { status: "active" } });
});
it("logs failed callbacks with a sanitized code and flags state tampering as suspicious", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.get.mockResolvedValue(new Response(null, { status: 302, headers: { Location: `${origin}/login?error=state_mismatch` } }));
  await get("callback/google?code=fixture&state=forged");
  const lines = warn.mock.calls.map(call => JSON.parse(String(call[0])));
  expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ event: "auth.sign_in_failed", reason: "state_mismatch" }), expect.objectContaining({ event: "auth.suspicious" })]));
  mocks.get.mockResolvedValue(new Response(null, { status: 302, headers: { Location: `${origin}/login?error=%3Cscript%3E` } }));
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  await get("callback/google?code=fixture&state=fixture");
  expect(JSON.parse(String(info.mock.calls.at(-1)?.[0]))).toMatchObject({ event: "auth.sign_in_failed", reason: "other" });
  expect(JSON.stringify([...warn.mock.calls, ...info.mock.calls])).not.toMatch(/fixture|forged|script/);
});
it("reports an unavailable service without leaking provider details", async () => {
  mocks.getEnv.mockImplementationOnce(() => { throw new Error("secret configuration detail"); });
  const response = await post("sign-in/social");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "authenticationUnavailable" });
});
