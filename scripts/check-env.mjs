// Compares variable names in .env.example and .env.local without printing values.
import { existsSync, readFileSync } from "node:fs";

const keys = (file) => readFileSync(file, "utf8").split(/\r?\n/)
  .map(line => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]).filter(Boolean);
const value = (file, key) => {
  const line = readFileSync(file, "utf8").split(/\r?\n/).find(item => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
};

if (!existsSync(".env.local")) {
  console.error("Missing .env.local. Copy .env.example to .env.local and fill in development values.");
  process.exit(1);
}
const expected = keys(".env.example"), actual = keys(".env.local");
const missing = expected.filter(key => !actual.includes(key));
// Retired settings are reported but never block; their values are no longer read.
const retired = ["SEED_USER_PASSWORD"];
const stale = actual.filter(key => retired.includes(key));
if (stale.length) console.warn(`Warning: remove retired variables from .env.local: ${stale.join(", ")}`);
const extra = actual.filter(key => !expected.includes(key) && !retired.includes(key));
const duplicated = actual.filter((key, index) => actual.indexOf(key) !== index);
const problems = [];
if (missing.length) problems.push(`Missing from .env.local: ${missing.join(", ")}`);
if (extra.length) problems.push(`Not in .env.example: ${extra.join(", ")}`);
if (duplicated.length) problems.push(`Duplicated in .env.local: ${[...new Set(duplicated)].join(", ")}`);
const namespace = value(".env.local", "CACHE_NAMESPACE");
if (namespace && !["development", "preview", "production", "test"].includes(namespace)) problems.push("CACHE_NAMESPACE must be development, preview, production or test.");
const appUrl = value(".env.local", "APP_URL");
if (appUrl && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(appUrl)) console.warn("Warning: APP_URL is not a localhost origin; local sign-in redirects will leave the dev server.");

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`.env.local matches .env.example (${expected.length} variables).`);
