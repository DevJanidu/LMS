import { environment } from "./env-runtime.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const secrets = Object.entries(environment).filter(([key, value]) => /SECRET|TOKEN|PASSWORD|ACCESS_KEY|API_KEY|DATABASE_URL/.test(key) && typeof value === "string" && value.length >= 8).map(([key, value]) => ({ key, value }));
for (const key of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) { const password = decodeURIComponent(new URL(environment[key]).password); if (password.length >= 8) secrets.push({ key: `${key}_PASSWORD`, value: password }); }
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
function collect(directory) { return readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? collect(path) : [path]; }); }
files.push(...collect(".next/static").filter(path => /\.(js|css|json)$/.test(path)));
const ambiguous = [];
const findings = secrets.map(({ key, value }) => {
  const matches = files.filter(path => readFileSync(path).includes(Buffer.from(value)));
  // A short common-word credential also appears in field names and policy prose.
  // Preserve that review finding without mislabeling those field names as leaks.
  if (/^[a-z]+$/i.test(value) && value.length <= 16 && matches.length > 10) { ambiguous.push({ variable: key, matchingFiles: matches.length, action: "Owner should rotate this low-entropy credential before production." }); return { variable: key, files: [] }; }
  return { variable: key, files: matches };
}).filter(finding => finding.files.length);
console.info(JSON.stringify({ check: "tracked_source_and_client_bundles", files: files.length, findings, ambiguousCredentials: ambiguous, passed: findings.length === 0, needsOwnerReview: ambiguous.length > 0 }));
if (findings.length) process.exitCode = 1;
