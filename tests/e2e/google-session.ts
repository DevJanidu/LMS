import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";
import type { BrowserContext } from "@playwright/test";

loadEnvConfig(process.cwd());

/**
 * Google's consent screen cannot be automated, so database-backed specs create
 * the rows a first Google sign-in would (user, google account, session) and set
 * the signed session cookie Better Auth issues after the OAuth callback.
 */
export async function signInAsNewGoogleLearner(context: BrowserContext, baseURL: string, name = "E2E Google Learner") {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
  const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET!;
  const userId = randomUUID(), token = randomBytes(24).toString("base64url");
  const email = `e2e-${userId}@example.com`;
  await sql.transaction([
    sql`INSERT INTO users (id, name, email, email_verified, role, status) VALUES (${userId}, ${name}, ${email}, true, 'learner', 'active')`,
    sql`INSERT INTO accounts (id, user_id, account_id, provider_id) VALUES (${randomUUID()}, ${userId}, ${`google-${userId}`}, 'google')`,
    sql`INSERT INTO sessions (id, user_id, token, expires_at) VALUES (${randomUUID()}, ${userId}, ${token}, ${new Date(Date.now() + 7 * 864e5)})`,
  ]);
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${signature}`), url: baseURL, httpOnly: true, sameSite: "Lax" }]);
  return { userId, email };
}
