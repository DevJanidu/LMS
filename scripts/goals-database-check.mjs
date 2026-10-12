import nextEnv from "@next/env";
import { spawn } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());
if (
  !process.argv.includes("--acknowledge-current-test-database") ||
  process.env.VERCEL_ENV === "production"
)
  throw new Error("Fixture-only test database acknowledgement required.");
const child = spawn(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "tests/goals-aven.integration.test.ts",
    ...(process.argv.includes("--sort-only")
      ? ["--testNamePattern", "sorts calculated progress"]
      : []),
    ...(process.argv.includes("--budget-only")
      ? ["--testNamePattern", "enforces the shared monthly budget"]
      : []),
    ...(process.argv.includes("--calendar-only")
      ? ["--testNamePattern", "shows upcoming recurring"]
      : []),
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      TEST_DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
      TEST_DATABASE_FIXTURES_ONLY: "true",
      CACHE_NAMESPACE: "test",
    },
  },
);
let output = "";
child.stdout.on("data", (data) => {
  output += data;
});
child.stderr.on("data", (data) => {
  output += data;
});
child.on("exit", (code) => {
  for (const line of output.split(/\r?\n/))
    if (
      /^\s*(Test Files|Tests|Duration|Start at|✓|×|❯)/u.test(
        line.replace(/\x1b\[[0-9;]*m/g, ""),
      )
    )
      console.info(line);
  if (code)
    console.error(
      "Database verification failed. Provider/connection details suppressed.",
    );
  process.exitCode = code ?? 1;
});
