import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Pattern scan only: never load environment files or print matched values.
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}\b/,
  /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]{8,}@(?![^\s/]*(?:example\.|fixture|POOLED_HOST|DIRECT_HOST))[^\s/]+/i,
];
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean);
const findings = [];
for (const file of files) {
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") findings.push(file);
  const contents = readFileSync(file);
  if (contents.length > 2 * 1024 * 1024 || contents.includes(0)) continue;
  if (patterns.some(pattern => pattern.test(contents.toString("utf8")))) findings.push(file);
}
console.log(JSON.stringify({ check: "tracked_secret_patterns", ok: findings.length === 0, files: [...new Set(findings)] }));
if (findings.length) process.exitCode = 1;
