import nextEnv from "@next/env";
import { parse } from "dotenv";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const selectedFile = process.argv
  .find((arg) => arg.startsWith("--env="))
  ?.slice(6);
let env = process.env;
if (selectedFile) {
  try {
    env = parse(readFileSync(selectedFile, "utf8"));
  } catch {
    console.log(
      JSON.stringify({
        check: "aven_configuration",
        configured: false,
        code: "environmentFileUnreadable",
      }),
    );
    process.exit(1);
  }
} else {
  nextEnv.loadEnvConfig(process.cwd());
}
mkdirSync(".audit-local", { recursive: true });
const runtime = resolve(".audit-local/aven-configuration.mjs");
writeFileSync(
  runtime,
  ts.transpileModule(readFileSync("src/lib/aven/configuration.ts", "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
const { resolveAvenConfiguration, avenConfigurationStatus } = await import(
  pathToFileURL(runtime).href
);
const status = avenConfigurationStatus(env);
console.log(JSON.stringify({ check: "aven_configuration", ...status }));
if (!status.configured) process.exit(1);
const { data: config } = resolveAvenConfiguration(env);
if (process.argv.includes("--connections")) {
  let failed = false;
  for (const model of new Set([
    config.OPENAI_CHAT_MODEL,
    config.OPENAI_PLANNING_MODEL,
  ])) {
    try {
      // Read-only metadata check: no generated tokens or chat contents.
      const response = await fetch(
        `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
        {
          headers: { Authorization: `Bearer ${config.OPENAI_API_KEY}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      console.log(
        JSON.stringify({
          check: "aven_model_access",
          model,
          ok: response.ok,
          status: response.status,
        }),
      );
      await response.body?.cancel();
      failed ||= !response.ok;
    } catch {
      failed = true;
      console.log(
        JSON.stringify({
          check: "aven_model_access",
          model,
          ok: false,
          error: "connectionFailed",
        }),
      );
    }
  }
  if (failed) process.exit(1);
}
