import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import en from "@/messages/en.json";
const roots = [
  "src/components/aven",
  "src/components/navigation",
  "src/components/goals",
];
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : /\.tsx?$/.test(name)
        ? [path]
        : [];
  });
const lookup = (key: string) =>
  key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      en,
    );
/** Catches keys used in components but missing from en.json (MISSING_MESSAGE at runtime). */
it("every literal translation key used by Aven, navigation and goals components exists", () => {
  const missing: string[] = [];
  for (const file of roots.flatMap(files)) {
    const source = readFileSync(file, "utf8");
    const translators = [
      ...source.matchAll(
        /(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\("([\w.]+)"\)/g,
      ),
    ];
    for (const [, name, namespace] of translators)
      for (const [, key] of source.matchAll(
        new RegExp(`\\b${name}\\(\\s*"([\\w.]+)"`, "g"),
      ))
        // Keys ending in "." are concatenated with a runtime value and cannot be checked statically.
        if (
          !key.endsWith(".") &&
          typeof lookup(`${namespace}.${key}`) !== "string"
        )
          missing.push(`${file}: ${namespace}.${key}`);
  }
  expect(missing).toEqual([]);
});
