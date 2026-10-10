import nextEnv from "@next/env";
import { spawn } from "node:child_process";
import { environment } from "./env-runtime.mjs";
nextEnv.loadEnvConfig(process.cwd());
if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Explicit current-test-database acknowledgement required; production refused.");
console.info("Running UUID fixture-only tests on the acknowledged current database; this does not verify a throwaway branch or reset existing data.");
const performance = process.argv.includes("--performance");
const pattern = process.argv.find(argument => argument.startsWith("--test-name-pattern="))?.slice(20);
const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", performance ? "tests/performance.integration.test.ts" : "tests/ownership.integration.test.ts", ...(pattern ? ["--testNamePattern", pattern] : [])], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, TEST_DATABASE_URL: environment.DATABASE_URL, TEST_DATABASE_FIXTURES_ONLY: "true", CACHE_NAMESPACE: "test", RUN_AUDIT_PERFORMANCE: performance ? "true" : "false" } });
let output = "";
child.stdout.on("data", data => { output += data.toString(); });
child.stderr.on("data", data => { output += data.toString(); });
child.on("exit", code => {
  // ORM failures can serialize connection objects and SQL parameters. Print
  // result summaries only; do not persist or forward raw integration logs.
  for (const line of output.split(/\r?\n/)) if (/^\s*(Test Files|Tests|Duration|Start at|✓|×|❯)/u.test(line.replace(/\x1b\[[0-9;]*m/g, ""))) console.info(line);
  if (code && /connect|fetch failed|Timeout/i.test(output)) console.info("Network or timeout failure occurred; connection objects and SQL parameters suppressed.");
  process.exitCode = code ?? 1;
});
