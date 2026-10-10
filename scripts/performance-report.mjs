import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const read = path => JSON.parse(readFileSync(path, "utf8"));
const inventory = read("docs/PERFORMANCE_INVENTORY.json");
const reports = Object.fromEntries(["GLOBAL_PERFORMANCE_RESULTS", "FINAL_MUTATION_METRICS", "SUPPLEMENTAL_PERFORMANCE_RESULTS", "DIALOG_PERFORMANCE_RESULTS", "UPLOAD_NEW_PERFORMANCE_RESULTS", "UPLOAD_STRESS_PERFORMANCE_RESULTS", "UPLOAD_PERFORMANCE_RESULTS"].map(name => {
  const report = read(`docs/${name}.json`);
  assert(!report.results.some(row => ["FAIL", "BLOCKED"].includes(row.status)), `Unresolved result in ${name}`);
  return [name, { passed: report.results.filter(row => row.status === "PASS").length, generatedAt: report.generatedAt }];
}));
const calendar = read("docs/CALENDAR_FINAL_RESULTS.json");
assert.equal(calendar.errors.length, 0);
const routes = read("docs/GLOBAL-FINAL_METRICS.json").metrics.filter(row => "fcpMs" in row);
const writes = read("docs/FINAL_MUTATION_METRICS.json").results;
const range = values => ({ min: Math.min(...values), max: Math.max(...values) });
const summary = { generatedAt: new Date().toISOString(), discovery: { sourceFiles: inventory.sourceFiles, routes: inventory.routes.length, components: inventory.components.length, componentFolders: inventory.modules.length }, reports,
  metrics: { firstContentfulPaintMs: range(routes.map(row => row.fcpMs)), routeNetworkIdleMs: range(routes.map(row => row.navigationIdleMs)), mutationConfirmationMs: range(writes.map(row => row.ms)), calendar: calendar.metrics.filter(row => /optimistic|cached week/.test(row.operation)) },
  limits: "Local production builds and UUID-scoped audit fixtures; remote services. Streamed first paint is not loaded content. Email, global cron execution and production capacity/SLA remain unverified. See GLOBAL_VALIDATION.md." };
const e2e = read(".audit-local/final-e2e.json");
assert.equal(e2e.stats.unexpected, 0); assert.equal(e2e.stats.flaky, 0); assert.equal(e2e.stats.skipped, 0);
summary.e2e = e2e.stats;
writeFileSync("docs/E2E_FINAL_RESULTS.json", JSON.stringify({ generatedAt: summary.generatedAt, stats: e2e.stats }, null, 2));
writeFileSync("docs/VALIDATION_SUMMARY.json", JSON.stringify(summary, null, 2));
console.info(JSON.stringify(summary));
