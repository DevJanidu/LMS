import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
import ts from "typescript";

// Deliberately read one file: never fall back to development credentials.
const args = process.argv.slice(2);
const file = args.find(arg => arg.startsWith("--env="))?.slice(6) ?? ".env.production";
let failed = false;
const report = (check, ok, detail) => {
  if (!ok) failed = true;
  console.log(JSON.stringify({ check, ok, ...(detail ? { detail } : {}) }));
};
let env;
try { env = parse(readFileSync(file, "utf8")); }
catch { report("environment_file", false, "Cannot read the requested environment file."); process.exit(1); }
mkdirSync(".audit-local", { recursive: true });
const runtime = resolve(".audit-local/production-env-runtime.mjs");
writeFileSync(runtime, ts.transpileModule(readFileSync("src/lib/env.ts", "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText);
const { validateEnvironment } = await import(pathToFileURL(runtime).href);
try {
  validateEnvironment({ ...env, NODE_ENV: "production", VERCEL_ENV: "production" });
  report("environment_schema", true);
} catch {
  // Schema diagnostics must never echo provider values.
  report("environment_schema", false, "Missing or invalid required variables; inspect the env file and src/lib/env.ts.");
}
const url = (value) => { try { return new URL(value); } catch { return undefined; } };
const app = url(env.APP_URL);
report("production_origin", Boolean(app && app.protocol === "https:" && !app.username && !app.password && !app.port && app.pathname === "/" && !app.search && !app.hash && !/^(localhost|127\.|0\.|\[::1\])/.test(app.hostname) && !app.hostname.endsWith(".example.com")), "APP_URL must be the final HTTPS origin without a path, query, or fragment.");
report("cache_namespace", env.CACHE_NAMESPACE === "production");
const pooled = url(env.DATABASE_URL), direct = url(env.DATABASE_URL_UNPOOLED);
report("neon_connection_pair", Boolean(pooled && direct && pooled.protocol === "postgresql:" && direct.protocol === "postgresql:" && pooled.hostname.includes("-pooler.") && !direct.hostname.includes("-pooler.") && pooled.hostname.replace("-pooler.", ".") === direct.hostname && pooled.pathname === direct.pathname && pooled.username === direct.username && pooled.password === direct.password && [pooled, direct].every(endpoint => ["require", "verify-full"].includes(endpoint.searchParams.get("sslmode")))), "Use pooled/direct connections to the same Neon database with TLS.");
report("runtime_only_variables", !Object.keys(env).some(key => /^(SEED_|TEST_|PLAYWRIGHT_|E2E_|AWS_|NEXT_PUBLIC_)/.test(key)), "Import only application variables, excluding seed, test, AWS aliases and public secrets.");
if (args.includes("--require-email")) report("email_credentials", Boolean(env.RESEND_API_KEY && env.EMAIL_FROM), "Both RESEND_API_KEY and EMAIL_FROM are required for email delivery.");
if (!env.RESEND_API_KEY || !env.EMAIL_FROM) console.log(JSON.stringify({ check: "account_email", warning: "Email is unconfigured; welcome, password reset and verification delivery are unavailable." }));
if (!env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) console.log(JSON.stringify({ check: "google_oauth", info: "Optional Google sign-in is disabled." }));

if (args.includes("--connections")) {
  const { neon } = await import("@neondatabase/serverless");
  for (const [name, connection] of [["pooled_database", env.DATABASE_URL], ["direct_database", env.DATABASE_URL_UNPOOLED]]) {
    try {
      const sql = neon(connection, { fetchOptions: { signal: AbortSignal.timeout(15000) } });
      const [row] = await sql`select 1 as reachable`;
      report(name, row.reachable === 1);
    } catch { report(name, false, "Read-only connection check failed."); }
  }
  try {
    const sql = neon(env.DATABASE_URL_UNPOOLED, { fetchOptions: { signal: AbortSignal.timeout(15000) } });
    const applied = await sql`select hash, created_at from drizzle.__drizzle_migrations`;
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const missing = journal.entries.filter(entry => {
      const source = readFileSync(`drizzle/${entry.tag}.sql`, "utf8");
      // Git can check SQL out with CRLF on Windows after a Linux migration.
      const lf = source.replace(/\r\n/g, "\n");
      const hashes = [source, lf, lf.replace(/\n/g, "\r\n")].map(text => createHash("sha256").update(text).digest("hex"));
      return !applied.some(row => Number(row.created_at) === entry.when && hashes.includes(row.hash));
    }).map(entry => entry.tag);
    report("migrations", missing.length === 0, `${journal.entries.length} committed migrations; unverified: ${missing.join(", ") || "none"}. No migrations executed.`);
  } catch { report("migrations", false, "Could not verify the migration journal."); }
  try {
    const { Redis } = await import("@upstash/redis");
    const redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN, retry: false, signal: () => AbortSignal.timeout(10000) });
    report("redis_ping", await redis.ping() === "PONG");
  } catch { report("redis_ping", false, "Redis credentials or connectivity could not be verified."); }
  try {
    const { S3Client, HeadBucketCommand, GetBucketCorsCommand, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const client = new S3Client({ endpoint: env.OBJECT_STORAGE_ENDPOINT, region: env.OBJECT_STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: env.OBJECT_STORAGE_SECRET_ACCESS_KEY }, maxAttempts: 1, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
    const send = command => client.send(command, { abortSignal: AbortSignal.timeout(15000) });
    await send(new HeadBucketCommand({ Bucket: env.OBJECT_STORAGE_BUCKET }));
    report("storage_bucket", true);
    try {
      const cors = await send(new GetBucketCorsCommand({ Bucket: env.OBJECT_STORAGE_BUCKET }));
      const allowed = cors.CORSRules?.some(rule => rule.AllowedOrigins?.includes(app?.origin) && ["PUT", "GET", "HEAD"].every(method => rule.AllowedMethods?.includes(method)) && rule.AllowedHeaders?.some(header => ["*", "content-type"].includes(header.toLowerCase())));
      report("production_storage_cors", Boolean(app && allowed), "Bucket CORS must allow the production origin and PUT/GET/HEAD with content-type.");
    } catch { report("production_storage_cors", false, "Could not verify production bucket CORS."); }
    const objects = await send(new ListObjectsV2Command({ Bucket: env.OBJECT_STORAGE_BUCKET, MaxKeys: 1 }));
    const key = objects.Contents?.[0]?.Key;
    if (key) {
      const endpoint = `${env.OBJECT_STORAGE_ENDPOINT.replace(/\/$/, "")}/${encodeURIComponent(env.OBJECT_STORAGE_BUCKET)}/${key.split("/").map(encodeURIComponent).join("/")}`;
      const response = await fetch(endpoint, { method: "HEAD", signal: AbortSignal.timeout(10000), redirect: "error" });
      report("anonymous_storage_read", [401, 403, 404].includes(response.status), "Anonymous HEAD on an existing object must be denied.");
    } else console.log(JSON.stringify({ check: "anonymous_storage_read", warning: "Bucket is empty; privacy requires provider confirmation or an upload smoke test." }));
    client.destroy();
  } catch { report("storage", false, "Read-only storage checks failed."); }
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    try {
      const response = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      const domain = env.EMAIL_FROM.match(/@([^>\s]+)>?$/)?.[1]?.toLowerCase();
      report("email_sender_domain", response.ok && Boolean(result.data?.some(item => item.name.toLowerCase() === domain && item.status === "verified")), "Sender domain must be verified; restricted sending-only keys need a manual provider check. No email sent.");
    } catch { report("email_sender_domain", false, "Could not verify email sender domain."); }
  }
}
console.log(JSON.stringify({ check: "scope", info: "Vercel project settings, live deployment, email delivery, signed uploads and restore procedures require separate verification." }));
if (args.includes("--build") && !failed) {
  // process.env has higher priority than .env.local in Next.js.
  const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
    env: { ...process.env, ...env, NODE_ENV: "production" }, stdio: "inherit", windowsHide: true,
  });
  report("production_build", build.status === 0);
}
process.exitCode = failed ? 1 : 0;
