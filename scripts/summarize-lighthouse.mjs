import { readFileSync, writeFileSync } from "node:fs";
const phase = process.argv[2] ?? "after", route = process.argv[3] ?? "login";
const report = JSON.parse(readFileSync(`.audit-local/${phase}/lighthouse-${route}.json`, "utf8"));
const result = { conditions: "Local production build; Lighthouse default mobile throttling. Provider roundtrip includes this machine's network, not deployed Vercel.", lighthouseVersion: report.lighthouseVersion, route: `/${route}`, performance: report.categories.performance.score * 100, accessibility: report.categories.accessibility.score * 100, metrics: Object.fromEntries(["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "speed-index", "cumulative-layout-shift", "server-response-time", "total-byte-weight"].map(key => [key, report.audits[key]?.numericValue])) };
writeFileSync(`docs/${phase.toUpperCase()}_LIGHTHOUSE_${route.toUpperCase()}.json`, JSON.stringify(result, null, 2));
console.info(JSON.stringify(result));
