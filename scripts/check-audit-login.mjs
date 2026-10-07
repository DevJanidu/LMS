import { readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
try {
  const response = await fetch("http://localhost:3100/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3100" }, body: JSON.stringify({ email: fixture.users[1].email, password: fixture.password }), signal: AbortSignal.timeout(20000) });
  console.info(JSON.stringify({ status: response.status, contentType: response.headers.get("content-type") }));
  const body = response.headers.get("content-type")?.includes("json") ? await response.json() : {};
  console.info(JSON.stringify({ status: response.status, ok: response.ok, errorCode: /^[A-Z_]{1,50}$/.test(body.code ?? "") ? body.code : undefined, receivedSessionCookie: Boolean(response.headers.get("set-cookie")) }));
} catch { console.info("Audit authentication request failed without response."); }
