import ts from "typescript";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
const all = files("src").map((path) => resolve(path));
const visited = new Set();
function visit(path) {
  if (visited.has(path)) return;
  visited.add(path);
  const source = readFileSync(path, "utf8");
  if (!/\.[cm]?[jt]sx?$/.test(path)) return;
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function inspect(node) {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifier = node.moduleSpecifier.text;
    if (specifier?.startsWith("@/") || specifier?.startsWith(".")) {
      const base = specifier.startsWith("@/")
        ? resolve("src", specifier.slice(2))
        : resolve(dirname(path), specifier);
      const candidate = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        join(base, "index.ts"),
        join(base, "index.tsx"),
      ].find((item) => existsSync(item) && all.includes(item));
      if (candidate) visit(candidate);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(tree);
}
for (const path of all.filter(
  (path) =>
    /[\\/]app[\\/].*\.tsx$/.test(path) ||
    /[\\/]proxy.ts$/.test(path) ||
    /[\\/]i18n[\\/]request.ts$/.test(path),
))
  visit(path);
console.log(
  JSON.stringify(
    all
      .filter(
        (path) =>
          /\.[jt]sx?$/.test(path) &&
          !path.endsWith(".d.ts") &&
          !visited.has(path),
      )
      .map((path) => path.slice(resolve(".").length + 1).replaceAll("\\", "/")),
  ),
);
