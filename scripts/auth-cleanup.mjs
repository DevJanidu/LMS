// One-off cleanup for data the Google-only design no longer needs. Dry run by default.
//
//   npm run auth:cleanup                                    # counts only
//   npm run auth:cleanup -- --clear-provider-tokens --confirm
//   npm run auth:cleanup -- --delete-password-accounts --confirm
//
// Clearing tokens keeps every account row, so Google sign-in (keyed by `sub`) is unaffected.
// Deleting password rows removes dormant hashes; the users and their data remain.
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { confirmed, loadEnvironment, openDatabase } from "./lib/database.mjs";

loadEnvironment("Auth cleanup");
const { db, schema } = await openDatabase();
const { accounts } = schema;
const tokenRows = or(isNotNull(accounts.accessToken), isNotNull(accounts.refreshToken), isNotNull(accounts.idToken));
const [counts] = await db.select({
  withTokens: sql`count(*) filter (where ${tokenRows})`.mapWith(Number),
  passwordAccounts: sql`count(*) filter (where ${accounts.providerId} = 'credential')`.mapWith(Number),
}).from(accounts);
process.stdout.write(`Accounts holding provider tokens: ${counts.withTokens}\nPassword (credential) accounts: ${counts.passwordAccounts}\n`);

const statements = [];
if (process.argv.includes("--clear-provider-tokens")) statements.push(db.update(accounts).set({ accessToken: null, refreshToken: null, idToken: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, updatedAt: new Date() }).where(and(eq(accounts.providerId, "google"), tokenRows)));
if (process.argv.includes("--delete-password-accounts")) statements.push(db.delete(accounts).where(eq(accounts.providerId, "credential")));
if (!statements.length) process.stdout.write("Nothing selected. Pass --clear-provider-tokens and/or --delete-password-accounts.\n");
else if (!confirmed()) process.stdout.write("Dry run. Re-run with --confirm to apply.\n");
else { await db.batch(statements); process.stdout.write("Cleanup applied.\n"); }
