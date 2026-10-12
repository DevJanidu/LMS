import nextEnv from "@next/env";
import { spawn } from "node:child_process";
nextEnv.loadEnvConfig(process.cwd());
const provider = process.argv.includes("--provider");
const database = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!database || (provider && !process.env.OPENAI_API_KEY)) {
  console.error(
    "Configure a database and, for --provider, OPENAI_API_KEY privately before running Aven verification.",
  );
  process.exit(1);
}
console.log(
  provider
    ? "Verifying disposable fixtures and genuine provider/browser journeys. Keep the local app running; provider calls use the configured shared budget."
    : "Verifying Aven on disposable owned database fixtures. No provider calls.",
);
const files = ["tests/aven-upgrade.integration.test.ts", "tests/study-attendance.integration.test.ts"];
if (provider) files.push("tests/aven-provider.integration.test.ts");
const child = spawn(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", ...files, "--reporter=verbose"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TEST_DATABASE_URL: database,
      TEST_DATABASE_FIXTURES_ONLY: "true",
      TEST_AVEN_PROVIDER: provider ? "true" : "false",
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ""} --dns-result-order=ipv4first`.trim(),
    },
  },
);
child.on("error", () => {
  console.error("Could not start Aven verification.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
