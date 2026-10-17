// Compares variable names in .env.example with each local env file, without printing values.
import { existsSync, readFileSync } from "node:fs";
import { ENV_FILES } from "./lib/env-file.mjs";

const keys = (file) => readFileSync(file, "utf8").split(/\r?\n/)
  .map(line => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1]).filter(Boolean);
const value = (file, key) => {
  const line = readFileSync(file, "utf8").split(/\r?\n/).find(item => item.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
};
// Retired settings are reported but never block; their values are no longer read.
const retired = ["SEED_USER_PASSWORD"];
const expected = keys(".env.example");
const problems = [];
let checked = 0;
for (const [environment, file] of Object.entries(ENV_FILES)) {
  if (!existsSync(file)) {
    // Only the development file is required locally; staging and production are optional.
    if (environment === "development") problems.push(`Missing ${file}. Copy .env.example to ${file} and fill in development values.`);
    continue;
  }
  checked++;
  const actual = keys(file);
  const extra = actual.filter(key => !expected.includes(key) && !retired.includes(key));
  const duplicated = actual.filter((key, index) => actual.indexOf(key) !== index);
  const stale = actual.filter(key => retired.includes(key));
  if (stale.length) console.warn(`Warning: remove retired variables from ${file}: ${stale.join(", ")}`);
  if (extra.length) problems.push(`${file}: not in .env.example: ${extra.join(", ")}`);
  if (duplicated.length) problems.push(`${file}: duplicated: ${[...new Set(duplicated)].join(", ")}`);
  if (value(file, "APP_ENV") !== environment) problems.push(`${file}: APP_ENV must be ${environment}.`);
  const namespace = value(file, "CACHE_NAMESPACE");
  if (namespace && !["development", "preview", "production", "test"].includes(namespace)) problems.push(`${file}: CACHE_NAMESPACE must be development, preview, production or test.`);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${checked} env file(s) use only names from .env.example (${expected.length} variables).`);
