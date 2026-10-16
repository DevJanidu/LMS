/**
 * Drives the real Better Auth engine (installed 1.7.7) through Google sign-in,
 * from `sign-in/social` to `/callback/google`, against an in-memory database.
 * Only Google's token endpoint is stubbed. Covers account takeover, account
 * pre-hijacking, privileged linking, OAuth state abuse and session handling.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { accountLinking, adminGoogleLinkIdentifier, beforeAccountCreate, beforeUserCreate, withoutProviderTokens } from "@/lib/auth/policy";

const base = "http://localhost:3000";
type Row = Record<string, unknown>;
let db: { user: Row[]; session: Row[]; account: Row[]; verification: Row[] };
let tokenRequests = 0;
function createAuth() {
  return betterAuth({
    baseURL: base, secret: "fixture-secret-fixture-secret-fixture-secret",
    database: memoryAdapter(db), logger: { disabled: true }, rateLimit: { enabled: false },
    onAPIError: { errorURL: `${base}/login` },
    emailAndPassword: { enabled: false },
    socialProviders: { google: { clientId: "fixture-client", clientSecret: "fixture-client-secret" } },
    account: { accountLinking, updateAccountOnSignIn: false },
    user: { additionalFields: { role: { type: "string", defaultValue: "learner", input: false }, status: { type: "string", defaultValue: "active", input: false } } },
    // Same policy functions as src/lib/auth/index.ts, without its logging and audit side effects.
    databaseHooks: {
      user: { create: { before: beforeUserCreate } },
      account: { create: { before: async (account, context) => { await beforeAccountCreate(account, context); return { data: withoutProviderTokens(account) }; } } },
    },
  });
}
let auth: ReturnType<typeof createAuth>;

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
interface Profile { sub: string; email: string; email_verified: boolean; name?: string; [claim: string]: unknown }
let profile: Profile;
beforeEach(() => {
  db = { user: [], session: [], account: [], verification: [] };
  tokenRequests = 0;
  auth = createAuth();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (!String(input).startsWith("https://oauth2.googleapis.com/token")) throw new Error(`unexpected fetch ${String(input)}`);
    tokenRequests++;
    // Back-channel response: Better Auth reads, but does not re-verify, this ID token.
    const idToken = `${encode({ alg: "RS256", kid: "fixture" })}.${encode({ iss: "https://accounts.google.com", aud: "fixture-client", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...profile })}.signature`;
    return Response.json({ access_token: "fixture-access-token", id_token: idToken, expires_in: 3599, token_type: "Bearer", scope: "openid email profile" });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

const cookiesFrom = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
async function startSignIn() {
  const response = await auth.handler(new Request(`${base}/api/auth/sign-in/social`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ provider: "google", callbackURL: "/login", errorCallbackURL: "/login" }) }));
  const { url } = await response.json() as { url: string };
  return { url: new URL(url), cookie: cookiesFrom(response) };
}
async function callback(state: string | null, cookie: string, code = "fixture-code") {
  const response = await auth.handler(new Request(`${base}/api/auth/callback/google?code=${code}&state=${state}`, { headers: { cookie } }));
  const location = new URL(response.headers.get("location") ?? "/", base);
  return { status: response.status, location, error: location.searchParams.get("error"), setCookie: response.headers.getSetCookie(), cookie: cookiesFrom(response) };
}
async function signInAs(next: Profile) {
  profile = next;
  const started = await startSignIn();
  return callback(started.url.searchParams.get("state"), started.cookie);
}
const now = () => new Date();
function seedUser<T extends { email: string } & Row>(fields: T) {
  const user = { id: crypto.randomUUID(), name: "Fixture", emailVerified: true, role: "learner", status: "active", createdAt: now(), updatedAt: now(), ...fields };
  db.user.push(user);
  return user;
}
const googleAccounts = (userId?: unknown) => db.account.filter(account => account.providerId === "google" && (userId === undefined || account.userId === userId));
const grant = (userId: unknown, value: object, expiresAt = new Date(Date.now() + 600_000)) => db.verification.push({ id: crypto.randomUUID(), identifier: adminGoogleLinkIdentifier(String(userId)), value: JSON.stringify(value), expiresAt, createdAt: now(), updatedAt: now() });

it("sends Google a PKCE challenge and binds the state to this browser", async () => {
  const { url, cookie } = await startSignIn();
  expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(`${base}/api/auth/callback/google`);
  expect(url.searchParams.get("scope")).toBe("email profile openid");
  expect(url.searchParams.has("access_type")).toBe(false);
  expect(cookie).toMatch(/better-auth\.state=/);
});

it("creates a verified first-time learner, stores no provider tokens and issues an HttpOnly Lax cookie", async () => {
  const result = await signInAs({ sub: "1001", email: "New.Student@Example.com", email_verified: true, name: "New Student" });
  expect(result.error).toBeNull();
  expect(result.location.pathname).toBe("/login");
  expect(db.user).toHaveLength(1);
  expect(db.user[0]).toMatchObject({ email: "new.student@example.com", role: "learner", status: "active", emailVerified: true });
  expect(googleAccounts()).toEqual([expect.objectContaining({ accountId: "1001", userId: db.user[0].id, accessToken: null, refreshToken: null, idToken: null })]);
  const sessionCookie = result.setCookie.find(value => value.startsWith("better-auth.session_token="))!;
  expect(sessionCookie).toMatch(/HttpOnly/i);
  expect(sessionCookie).toMatch(/SameSite=Lax/i);
  expect(db.session).toHaveLength(1);
});

it("signs a returning learner into the same account by Google sub with a fresh session token", async () => {
  const first = await signInAs({ sub: "1002", email: "returning@example.com", email_verified: true });
  const second = await signInAs({ sub: "1002", email: "returning@example.com", email_verified: true });
  expect(second.error).toBeNull();
  expect(db.user).toHaveLength(1);
  expect(googleAccounts()).toHaveLength(1);
  expect(googleAccounts()[0]).toMatchObject({ accessToken: null, idToken: null });
  // A new token per sign-in: nothing from before authentication is reused (no fixation).
  expect(db.session).toHaveLength(2);
  expect(first.cookie).not.toBe(second.cookie);
});

it("ignores role and status claims in the Google profile", async () => {
  await signInAs({ sub: "1003", email: "claims@example.com", email_verified: true, role: "super_admin", status: "active" });
  expect(db.user[0]).toMatchObject({ role: "learner" });
});

it("refuses an unverified Google email: no user row, no account, no session (pre-hijacking)", async () => {
  const result = await signInAs({ sub: "2001", email: "victim@school.example", email_verified: false });
  expect(result.error).toBe("EMAIL_NOT_VERIFIED");
  expect(db.user).toHaveLength(0);
  expect(db.account).toHaveLength(0);
  expect(db.session).toHaveLength(0);
  // The real owner can still register later.
  expect((await signInAs({ sub: "2002", email: "victim@school.example", email_verified: true })).error).toBeNull();
  expect(db.user).toHaveLength(1);
});

it("never attaches a Google identity to a super_admin from an email match alone", async () => {
  const admin = seedUser({ email: "admin@acadence.example", role: "super_admin" });
  for (const emailVerified of [true, false]) {
    const result = await signInAs({ sub: "3001", email: "admin@acadence.example", email_verified: emailVerified });
    expect(result.error).toBe(emailVerified ? "ADMIN_LINK_NOT_AUTHORIZED" : "account_not_linked");
  }
  expect(googleAccounts(admin.id)).toHaveLength(0);
  expect(db.session).toHaveLength(0);
  expect(db.user).toHaveLength(1);
});

it("links an administrator once through an operator grant, then refuses any other Google identity", async () => {
  const admin = seedUser({ email: "admin@acadence.example", role: "super_admin" });
  grant(admin.id, { email: admin.email });
  const linked = await signInAs({ sub: "3101", email: "admin@acadence.example", email_verified: true });
  expect(linked.error).toBeNull();
  expect(googleAccounts(admin.id)).toEqual([expect.objectContaining({ accountId: "3101" })]);
  expect(db.verification.filter(row => String(row.identifier).startsWith("admin-google-link:"))).toHaveLength(0);
  expect(db.session).toHaveLength(1);
  // Returning admin signs in by sub without any grant.
  expect((await signInAs({ sub: "3101", email: "admin@acadence.example", email_verified: true })).error).toBeNull();
  // A second identity asserting the same verified address is refused, even with a fresh grant.
  grant(admin.id, { email: admin.email });
  expect((await signInAs({ sub: "3199", email: "admin@acadence.example", email_verified: true })).error).toBe("GOOGLE_IDENTITY_ALREADY_LINKED");
  expect(googleAccounts(admin.id)).toHaveLength(1);
});

it("rejects expired, mismatched and replayed administrator grants", async () => {
  const admin = seedUser({ email: "admin@acadence.example", role: "super_admin" });
  grant(admin.id, { email: admin.email }, new Date(Date.now() - 1000));
  expect((await signInAs({ sub: "3201", email: admin.email, email_verified: true })).error).toBe("ADMIN_LINK_NOT_AUTHORIZED");
  grant(admin.id, { email: admin.email, googleSub: "3299" });
  expect((await signInAs({ sub: "3201", email: admin.email, email_verified: true })).error).toBe("ADMIN_LINK_NOT_AUTHORIZED");
  // That failed attempt consumed the grant; it cannot be retried.
  expect((await signInAs({ sub: "3299", email: admin.email, email_verified: true })).error).toBe("ADMIN_LINK_NOT_AUTHORIZED");
  grant(admin.id, { email: "someone-else@acadence.example" });
  expect((await signInAs({ sub: "3201", email: admin.email, email_verified: true })).error).toBe("ADMIN_LINK_NOT_AUTHORIZED");
  expect(googleAccounts(admin.id)).toHaveLength(0);
  expect(db.user[0]).toMatchObject({ role: "super_admin" });
});

it("moves a legacy password-era learner to Google only with a verified email", async () => {
  const legacy = seedUser({ email: "legacy@example.com", emailVerified: false });
  db.account.push({ id: crypto.randomUUID(), userId: legacy.id, providerId: "credential", accountId: legacy.id, password: "dormant-hash", createdAt: now(), updatedAt: now() });
  expect((await signInAs({ sub: "4001", email: "legacy@example.com", email_verified: false })).error).toBe("account_not_linked");
  expect(googleAccounts(legacy.id)).toHaveLength(0);
  expect((await signInAs({ sub: "4001", email: "legacy@example.com", email_verified: true })).error).toBeNull();
  expect(googleAccounts(legacy.id)).toHaveLength(1);
  expect(db.user).toHaveLength(1);
  expect(db.user[0]).toMatchObject({ role: "learner", emailVerified: true });
});

it("refuses a second Google identity for a learner who already has one", async () => {
  await signInAs({ sub: "5001", email: "owner@example.com", email_verified: true });
  const takeover = await signInAs({ sub: "5002", email: "owner@example.com", email_verified: true });
  expect(takeover.error).toBe("GOOGLE_IDENTITY_ALREADY_LINKED");
  expect(googleAccounts()).toHaveLength(1);
  expect(db.session).toHaveLength(1);
});

it("rejects forged, missing, cross-browser and replayed OAuth state before contacting Google", async () => {
  profile = { sub: "6001", email: "state@example.com", email_verified: true };
  const { url, cookie } = await startSignIn();
  const state = url.searchParams.get("state");
  expect((await callback("forged-state", cookie)).error).toBe("state_mismatch");
  expect((await callback(null, cookie)).error).toMatch(/state/);
  expect(tokenRequests).toBe(0);
  // Login CSRF: the attacker's state, completed in a browser without the matching state cookie.
  const csrf = await startSignIn();
  expect((await callback(csrf.url.searchParams.get("state"), "")).error).toBe("state_mismatch");
  // Legitimate completion, then a replay of the same state and code.
  expect((await callback(state, cookie)).error).toBeNull();
  expect((await callback(state, cookie)).error).toBe("state_mismatch");
  expect(tokenRequests).toBe(1);
  expect(db.session).toHaveLength(1);
});

it("treats revoked, expired and forged session cookies as signed out", async () => {
  const result = await signInAs({ sub: "7001", email: "session@example.com", email_verified: true });
  const headers = () => new Headers({ cookie: result.cookie });
  expect(await auth.api.getSession({ headers: headers() })).toMatchObject({ user: { email: "session@example.com" } });
  const forged = result.cookie.replace(/session_token=([^.;]+)\.([^;]+)/, "session_token=$1.tampered");
  expect(await auth.api.getSession({ headers: new Headers({ cookie: forged }) })).toBeNull();
  db.session[0].expiresAt = new Date(Date.now() - 1000);
  expect(await auth.api.getSession({ headers: headers() })).toBeNull();
  db.session.length = 0;
  expect(await auth.api.getSession({ headers: headers() })).toBeNull();
});
