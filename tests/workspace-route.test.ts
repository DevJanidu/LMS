import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), mutate: vi.fn(), shell: vi.fn(), subjects: vi.fn(), resources: vi.fn(), analytics: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://study.example" }) }));
vi.mock("@/lib/rate-limit", () => ({ requestLimit: async () => "allowed" }));
vi.mock("@/lib/services/mutations", () => ({ DomainError: class extends Error {}, mutate: mocks.mutate }));
vi.mock("@/lib/services/workspace", () => ({ getShellWorkspace: mocks.shell }));
vi.mock("@/lib/services/focused-workspace", () => ({ subjectPageWorkspace: mocks.subjects, resourcePageWorkspace: mocks.resources, analyticsPageWorkspace: mocks.analytics }));
import { GET, POST } from "@/app/api/workspace/route";
import { AuthenticationUnavailable } from "@/lib/auth/errors";
const request = (body: string, origin = "https://study.example") => new Request("https://study.example/api/workspace", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "actor", role: "learner" }); mocks.mutate.mockResolvedValue({}); mocks.subjects.mockResolvedValue({ subjects: [], topics: [], subjectStatistics: {} }); });
it("rejects foreign origins, invalid JSON and anonymous mutations", async () => {
  expect((await POST(request("{}", "https://attacker.example"))).status).toBe(403);
  expect((await POST(request("{"))).status).toBe(400);
  expect((await POST(request('{"operations":[]}'))).status).toBe(400);
  mocks.user.mockResolvedValueOnce(null);
  expect((await POST(request("{}"))).status).toBe(401);
  expect(mocks.mutate).not.toHaveBeenCalled();
});
it("confirms a scoped mutation without loading or serializing a workspace", async () => {
  const operations = [{ kind: "subject", value: { id: crypto.randomUUID(), title: "Subject", description: "", color: "brand", status: "active" } }];
  const response = await POST(request(JSON.stringify({ operations, userId: "attacker-supplied-target" })));
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.mutate).toHaveBeenCalledWith("actor", operations, undefined);
  expect(mocks.shell).not.toHaveBeenCalled(); expect(mocks.subjects).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("loads only requested groups and rejects learner reads for admin accounts", async () => {
  const response = await GET(new Request("https://study.example/api/workspace?groups=subjects"));
  expect(response.status).toBe(200); expect(mocks.subjects).toHaveBeenCalledOnce();
  expect(mocks.shell).not.toHaveBeenCalled(); expect(mocks.analytics).not.toHaveBeenCalled();
  mocks.user.mockResolvedValueOnce({ id: "admin", role: "super_admin" });
  expect((await GET(new Request("https://study.example/api/workspace?groups=subjects"))).status).toBe(403);
});
it("does not acknowledge success before the transaction promise commits", async () => {
  let commit!: (result: unknown) => void;
  mocks.mutate.mockImplementation(() => new Promise(resolve => { commit = resolve; }));
  const operations = [{ kind: "delete", entity: "subject", id: crypto.randomUUID() }];
  let responded = false;
  const response = POST(request(JSON.stringify({ operations }))).then(value => { responded = true; return value; });
  await vi.waitFor(() => expect(commit).toBeDefined());
  expect(responded).toBe(false);
  commit({ changes: { deleted: operations }, userUpdatedAt: "2026-10-09T00:00:00Z" });
  expect(await (await response).json()).toMatchObject({ ok: true, changes: { deleted: operations } });
});
it("distinguishes expired sessions, authentication outages and uncertain database failures", async () => {
  const body = JSON.stringify({ operations: [{ kind: "delete", entity: "subject", id: crypto.randomUUID() }] });
  mocks.user.mockRejectedValueOnce(new AuthenticationUnavailable(new Error("offline")));
  const auth = await POST(request(body)); expect(auth.status).toBe(503);
  expect(await auth.json()).toMatchObject({ error: "authenticationUnavailable", uncertain: false });
  mocks.mutate.mockRejectedValueOnce(new Error("commit response lost"));
  const db = await POST(request(body)); expect(db.status).toBe(503);
  expect(await db.json()).toMatchObject({ error: "databaseUnavailable", uncertain: true });
});
