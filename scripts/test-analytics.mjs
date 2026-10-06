import ts from "typescript";
import "./check-messages.mjs";
import { readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
// Compile the pure module with the installed TypeScript; no test package needed.
const directory = resolve(".analytics-tests");
mkdirSync(directory, { recursive: true });
try {
  const source = readFileSync("src/lib/analytics/index.ts", "utf8");
  writeFileSync(
    resolve(directory, "analytics.cjs"),
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );
  const scheduleSource = readFileSync("src/lib/schedule/index.ts", "utf8");
  writeFileSync(
    resolve(directory, "schedule.cjs"),
    ts
      .transpileModule(scheduleSource, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replace(
        'require("@/lib/analytics")',
        'require("./analytics.cjs")',
      ),
  );
  const result = spawnSync(
    process.execPath,
    ["--test", "tests/analytics.test.cjs", "tests/schedule.test.cjs"],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  for (const file of [
    resolve(directory, "analytics.cjs"),
    resolve(directory, "schedule.cjs"),
  ])
    rmSync(file, { force: true });
}
