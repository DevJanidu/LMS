"use server";
import { and, desc, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { getAuth, readActiveSession, recordAudit, requireUser } from "@/lib/auth";
import { authEvent } from "@/lib/auth/events";
import { describeDevice, type DeviceSummary } from "@/lib/auth/device";
import { getDb } from "@/lib/db";
import { authSessions } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/validation";

export async function signOut() {
  const user = await requireUser();
  await getAuth().api.signOut({ headers: await headers() });
  authEvent("auth.sign_out", { userId: user.id, role: user.role, scope: "current" });
}

export interface SignedInDevice extends DeviceSummary { id: string; current: boolean; signedInAt: string; lastActiveAt: string }

/** The caller's live sessions. Tokens and IP addresses never leave the server. */
export async function listMySessions(): Promise<{ ok: true; devices: SignedInDevice[] } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    const current = await readActiveSession(await headers());
    const rows = await getDb().select({ id: authSessions.id, userAgent: authSessions.userAgent, createdAt: authSessions.createdAt, updatedAt: authSessions.updatedAt })
      .from(authSessions).where(and(eq(authSessions.userId, user.id), gt(authSessions.expiresAt, new Date()))).orderBy(desc(authSessions.updatedAt)).limit(50);
    const devices = rows.map(row => ({ id: row.id, current: row.id === current?.session.id, signedInAt: row.createdAt.toISOString(), lastActiveAt: row.updatedAt.toISOString(), ...describeDevice(row.userAgent) }));
    return { ok: true, devices: devices.sort((a, b) => Number(b.current) - Number(a.current)) };
  } catch { return { ok: false, error: "databaseUnavailable" }; }
}

/** Ends one of the caller's other sessions. Only rows owned by the caller can match. */
export async function signOutDevice(input: unknown) {
  const user = await requireUser();
  const id = uuidSchema.safeParse(input);
  if (!id.success) return { ok: false as const, error: "invalidInput" };
  try {
    const current = await readActiveSession(await headers());
    if (current?.session.id === id.data) return { ok: false as const, error: "invalidInput" };
    const removed = await getDb().delete(authSessions).where(and(eq(authSessions.id, id.data), eq(authSessions.userId, user.id))).returning({ id: authSessions.id });
    if (!removed.length) return { ok: false as const, error: "recordUnavailable" };
    authEvent("auth.session_revoked", { userId: user.id, role: user.role, scope: "others", count: 1 });
    recordAudit(user.id, "sessionsRevoked", user.id, { scope: "device" });
    return { ok: true as const };
  } catch { return { ok: false as const, error: "saveFailed" }; }
}

/** Deletes every other session row, so copied cookies on other devices stop working at once. */
export async function signOutOtherDevices() {
  const user = await requireUser();
  try {
    await getAuth().api.revokeOtherSessions({ headers: await headers() });
    authEvent("auth.session_revoked", { userId: user.id, role: user.role, scope: "others" });
    recordAudit(user.id, "sessionsRevoked", user.id, { scope: "others" });
    return { ok: true as const };
  } catch { return { ok: false as const, error: "saveFailed" }; }
}

/** Deletes all of the user's sessions, including this one; the client then returns to sign-in. */
export async function signOutEverywhere() {
  const user = await requireUser();
  try {
    await getAuth().api.revokeSessions({ headers: await headers() });
    authEvent("auth.session_revoked", { userId: user.id, role: user.role, scope: "all" });
    recordAudit(user.id, "sessionsRevoked", user.id, { scope: "all" });
    return { ok: true as const };
  } catch { return { ok: false as const, error: "saveFailed" }; }
}
