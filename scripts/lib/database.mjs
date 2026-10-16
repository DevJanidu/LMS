// Shared CLI database access: loads env, refuses production unless explicitly
// allowed, and compiles the Drizzle schema with the installed TypeScript.
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import ts from "typescript";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertEnvironmentIsolation } from "../../src/lib/deployment-policy.mjs";

export function loadEnvironment(action) {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  // Outside production, refuse any production database, storage or credential.
  assertEnvironmentIsolation(process.env);
  if ((process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") && !process.argv.includes("--allow-production")) {
    throw new Error(`${action} refused in production. Use --allow-production only for a deliberate, approved change.`);
  }
  if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("DATABASE_URL_UNPOOLED is required.");
}

export async function openDatabase() {
  // The schema is split across src/lib/db/schema*.ts; compile every module and
  // point their relative imports at the compiled .mjs siblings.
  const temporary = mkdtempSync(resolve(".db-runtime-"));
  const sources = readdirSync("src/lib/db").filter(name => /^schema(-[a-z]+)?\.ts$/.test(name));
  const written = [];
  for (const name of sources) {
    const output = ts.transpileModule(readFileSync(join("src/lib/db", name), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
      .replace(/from "\.\/(schema(?:-[a-z]+)?)"/g, 'from "./$1.mjs"');
    const file = join(temporary, name.replace(/\.ts$/, ".mjs"));
    writeFileSync(file, output);
    written.push(file);
  }
  let schema;
  try { schema = await import(pathToFileURL(join(temporary, "schema.mjs")).href); }
  finally { written.forEach(file => unlinkSync(file)); rmdirSync(temporary); }
  return { db: drizzle(neon(process.env.DATABASE_URL_UNPOOLED), { schema }), schema };
}

/** `--name value` from argv. */
export function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
export const confirmed = () => process.argv.includes("--confirm");
