import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import { verify } from "@node-rs/argon2";

config({ path: ".env.local", quiet: true });
const report = (check, result) => process.stdout.write(`${JSON.stringify({ check, ...result })}\n`);
let failed = false;
try {
  const sql = neon(process.env.DATABASE_URL_UNPOOLED);
  const [database] = await sql`select current_database() as database, current_user as role, version() as version`;
  const tables = await sql`select tablename from pg_tables where schemaname = 'public' order by tablename`;
  report("database", { ok: true, database: database.database, version: database.version.split(" ").slice(0, 2).join(" "), tables: tables.map(row => row.tablename) });
  const pooled = neon(process.env.DATABASE_URL);
  const [pooledResult] = await pooled`select 1 as reachable`;
  report("pooled_database", { ok: pooledResult.reachable === 1 });
  if (tables.some(row => row.tablename === "users") && process.env.SEED_USER_EMAIL && process.env.SEED_USER_PASSWORD) {
    const [user] = await sql`select u.role, u.status, a.password from users u join accounts a on a.user_id = u.id where u.email = ${process.env.SEED_USER_EMAIL.toLowerCase()} and a.provider_id = 'credential'`;
    const passwordMatches = Boolean(user?.password && await verify(user.password, process.env.SEED_USER_PASSWORD));
    report("seed_user", { ok: passwordMatches, role: user?.role, status: user?.status, passwordMatches, hashAlgorithm: user?.password?.startsWith("$argon2id$") ? "argon2id" : "other" });
    if (!passwordMatches) failed = true;
    const [migration] = await sql`select count(*)::int as applied from drizzle.__drizzle_migrations`;
    report("migrations", { ok: true, applied: migration.applied });
  }
} catch (error) {
  failed = true;
  report("database", { ok: false, code: /^[A-Z0-9_]{2,30}$/.test(error?.code ?? "") ? error.code : "CONNECTION_FAILED" });
}
try {
  const client = new S3Client({ endpoint: process.env.OBJECT_STORAGE_ENDPOINT, region: process.env.OBJECT_STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
  const result = await client.send(new ListBucketsCommand({}));
  report("storage", { ok: true, buckets: result.Buckets?.map(bucket => bucket.Name) ?? [] });
} catch (error) {
  failed = true;
  report("storage", { ok: false, code: error?.name ?? "CONNECTION_FAILED", status: error?.$metadata?.httpStatusCode });
}
process.exitCode = failed ? 1 : 0;
