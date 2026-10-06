import assert from "node:assert/strict";
import ts from "typescript";
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
for (const locale of ["ar", "es", "de"])
  assert.deepEqual(
    keys(
      JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")).studyflow,
    ).sort(),
    expected,
    `${locale} message keys`,
  );
function inspectDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspectDirectory(path);
    else if (/\.tsx?$/.test(path)) {
      const tree = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function inspect(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "t" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        )
          assert.ok(
            available.has(node.arguments[0].text),
            `Missing message ${node.arguments[0].text} in ${path}`,
          );
        ts.forEachChild(node, inspect);
      }
      inspect(tree);
    }
  }
}
inspectDirectory("src");
console.log(
  `PASS localized key parity and literal references (${expected.length} messages)`,
);
