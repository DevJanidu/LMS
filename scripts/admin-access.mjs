// Audited administrator provisioning. Privilege is bound to an internal user ID
// and a Google identity, never granted by an email match alone.
//
//   npm run admin:access -- status
//   npm run admin:access -- authorize-google-link --email admin@example.com [--google-sub <sub>] [--minutes 15] --confirm
//   npm run admin:access -- promote --user-id <uuid> --confirm
//   npm run admin:access -- revoke --user-id <uuid> --confirm
//
// Writes run only with --confirm, and in production only with --allow-production.
import { and, eq, inArray } from "drizzle-orm";
import { confirmed, loadEnvironment, openDatabase, option } from "./lib/database.mjs";

const command = process.argv[2];
loadEnvironment("Admin access change");
const { db, schema } = await openDatabase();
const { users, accounts, authSessions, verifications, auditLogs } = schema;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = message => { process.stderr.write(`${message}\n`); process.exit(1); };
const write = async (summary, statements) => {
  if (!confirmed()) { process.stdout.write(`Dry run: ${summary}\nRe-run with --confirm to apply.\n`); return; }
  await db.batch(statements);
  process.stdout.write(`Done: ${summary}\n`);
};
async function googleAccounts(userIds) {
  if (!userIds.length) return new Set();
  const rows = await db.select({ userId: accounts.userId }).from(accounts).where(and(inArray(accounts.userId, userIds), eq(accounts.providerId, "google")));
  return new Set(rows.map(row => row.userId));
}

if (command === "status") {
  const admins = await db.select({ id: users.id, email: users.email, status: users.status }).from(users).where(eq(users.role, "super_admin"));
  const linked = await googleAccounts(admins.map(admin => admin.id));
  for (const admin of admins) process.stdout.write(`${admin.id}  ${admin.status.padEnd(11)}  google:${linked.has(admin.id) ? "linked" : "not linked"}  ${admin.email}\n`);
  if (!admins.length) process.stdout.write("No super_admin accounts.\n");
} else if (command === "authorize-google-link") {
  const email = option("email")?.trim().toLowerCase();
  const googleSub = option("google-sub");
  const minutes = Number(option("minutes") ?? 15);
  if (!email) fail("--email is required.");
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) fail("--minutes must be 1-60.");
  if (googleSub !== undefined && !/^\d{1,64}$/.test(googleSub)) fail("--google-sub must be the numeric Google subject identifier.");
  const [admin] = await db.select({ id: users.id, email: users.email, status: users.status }).from(users).where(and(eq(users.email, email), eq(users.role, "super_admin")));
  if (!admin || admin.status !== "active") fail("No active super_admin has that email.");
  if ((await googleAccounts([admin.id])).has(admin.id)) fail("This administrator already has a Google identity; nothing to authorize.");
  const identifier = `admin-google-link:${admin.id}`;
  await write(`allow ${email} to link one verified Google identity${googleSub ? ` (sub ${googleSub})` : ""} within ${minutes} minutes`, [
    db.delete(verifications).where(eq(verifications.identifier, identifier)),
    db.insert(verifications).values({ identifier, value: JSON.stringify({ email: admin.email, ...(googleSub ? { googleSub } : {}) }), expiresAt: new Date(Date.now() + minutes * 60_000) }),
    db.insert(auditLogs).values({ actorUserId: null, action: "adminLinkAuthorized", targetType: "user", targetId: admin.id, metadata: { via: "cli", minutes, subPinned: Boolean(googleSub) } }),
  ]);
  if (confirmed()) process.stdout.write("The administrator can now choose Continue with Google once. The grant is single-use.\n");
} else if (command === "promote" || command === "revoke") {
  const userId = option("user-id");
  if (!userId || !uuid.test(userId)) fail("--user-id must be a user UUID (see the admin Users page).");
  const [user] = await db.select({ id: users.id, role: users.role, status: users.status, emailVerified: users.emailVerified }).from(users).where(eq(users.id, userId));
  if (!user) fail("User not found.");
  if (command === "promote") {
    if (user.role !== "learner" || user.status !== "active") fail("Only an active learner can be promoted.");
    if (!user.emailVerified || !(await googleAccounts([userId])).has(userId)) fail("The user must have signed in with a verified Google account first.");
  } else if (user.role !== "super_admin") fail("User is not a super_admin.");
  const role = command === "promote" ? "super_admin" : "learner";
  // Ending existing sessions applies the new role's session lifetime immediately.
  await write(`${command === "promote" ? "grant" : "remove"} super_admin for ${userId} and end its sessions`, [
    db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId)),
    db.delete(authSessions).where(eq(authSessions.userId, userId)),
    db.insert(auditLogs).values({ actorUserId: null, action: command === "promote" ? "roleGranted" : "roleRevoked", targetType: "user", targetId: userId, metadata: { via: "cli", role: "super_admin" } }),
  ]);
} else {
  fail("Usage: admin-access.mjs status | authorize-google-link --email <email> [--google-sub <sub>] [--minutes 15] --confirm | promote --user-id <uuid> --confirm | revoke --user-id <uuid> --confirm");
}
