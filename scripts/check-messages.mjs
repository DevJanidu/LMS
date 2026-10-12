import assert from "node:assert/strict";
import { messageReferences } from "./message-references.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
function keys(value, prefix = "") {
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === "string"
      ? [`${prefix}${key}`]
      : keys(item, `${prefix}${key}.`),
  );
}
const messages = JSON.parse(
  readFileSync("src/messages/en.json", "utf8"),
).studyflow;
const expected = keys(messages).sort();
const available = new Set(expected);
function inspectDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspectDirectory(path);
    else if (/\.tsx?$/.test(path)) {
      for (const key of messageReferences(readFileSync(path, "utf8"), path))
        assert.ok(available.has(key), `Missing message ${key} in ${path}`);
    }
  }
}
inspectDirectory("src");
console.log(
  `PASS English message references (${expected.length} messages)`,
);
