import { environment as env } from "./env-runtime.mjs";
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
if (!process.argv.includes("--acknowledge-current-test-database") || process.env.VERCEL_ENV === "production") throw new Error("Acknowledged test database required. Production refused.");
const sql = neon(env.DATABASE_URL), fixture = JSON.parse(readFileSync(".audit-local/fixtures.json", "utf8"));
const queries = [
  ["local-day analytics", "WITH owned AS (SELECT subject_id, started_at, ended_at, duration_seconds FROM study_sessions WHERE user_id=$1::uuid AND status='valid' AND duration_seconds>=60), fragments AS (SELECT subject_id,d::date::text AS day,duration_seconds * EXTRACT(EPOCH FROM (LEAST(ended_at,(d+INTERVAL '1 day') AT TIME ZONE 'Asia/Colombo')-GREATEST(started_at,d AT TIME ZONE 'Asia/Colombo'))) / NULLIF(EXTRACT(EPOCH FROM (ended_at-started_at)),0) AS seconds FROM owned CROSS JOIN LATERAL generate_series(date_trunc('day', started_at AT TIME ZONE 'Asia/Colombo'), date_trunc('day',ended_at AT TIME ZONE 'Asia/Colombo'),INTERVAL '1 day') d) SELECT day,subject_id,SUM(GREATEST(seconds,0)) FROM fragments GROUP BY day,subject_id ORDER BY day", true],
  ["subject totals", "SELECT subject_id,sum(duration_seconds),count(*) FROM study_sessions WHERE user_id=$1::uuid AND status='valid' AND duration_seconds>=60 GROUP BY subject_id", true],
  ["recent subject sessions", "SELECT id,subject_id,started_at,ended_at,duration_seconds FROM (SELECT id,subject_id,started_at,ended_at,duration_seconds,row_number() OVER (PARTITION BY subject_id ORDER BY started_at DESC) rank FROM study_sessions WHERE user_id=$1::uuid) ranked WHERE rank<=3", true],
  ["history page", "SELECT id,subject_id,topic_id,started_at,ended_at,duration_seconds,status,source,created_at FROM study_sessions WHERE user_id=$1::uuid ORDER BY started_at DESC,id DESC LIMIT 20", true],
  ["history count", "SELECT count(*) FROM study_sessions WHERE user_id=$1::uuid AND status='valid' AND duration_seconds>=60", true],
  ["subject progress", "SELECT t.subject_id,count(*) FILTER(WHERE NOT t.archived),count(*) FILTER(WHERE NOT t.archived AND t.status='completed') FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE s.user_id=$1::uuid GROUP BY t.subject_id", true],
  ["resource metadata page", "SELECT id,subject_id,topic_id,type,title,url,mime_type,size_bytes,created_at FROM resources WHERE user_id=$1::uuid ORDER BY created_at DESC,id DESC LIMIT 20", true],
  ["calendar range", "SELECT id,starts_at,ends_at,recurrence_rule FROM schedule_blocks WHERE user_id=$1::uuid AND (recurrence_rule IS NOT NULL OR (ends_at>=now()-interval '1 day' AND starts_at<now()+interval '1 month'))", true],
  ["platform daily activity", "SELECT (started_at AT TIME ZONE 'Asia/Colombo')::date,count(distinct user_id),count(*),sum(duration_seconds) FROM study_sessions WHERE status='valid' AND (started_at AT TIME ZONE 'Asia/Colombo')::date>=current_date-89 GROUP BY 1", false],
  ["platform account growth", "SELECT d::date,count(u.id) FROM generate_series(current_date-89,current_date,interval '1 day') d LEFT JOIN users u ON u.role='learner' AND (u.created_at AT TIME ZONE 'Asia/Colombo')::date<=d::date GROUP BY d", false],
];
function nodes(plan) { return [{ type: plan["Node Type"], relation: plan["Relation Name"], index: plan["Index Name"], rows: plan["Actual Rows"], loops: plan["Actual Loops"] }, ...(plan.Plans ?? []).flatMap(nodes)]; }
try {
  const results = [];
  for (const [family, statement, scoped] of queries) {
    const start = performance.now();
    const [row] = await sql.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement}`, scoped ? [fixture.users[0].id] : []);
    const plan = row["QUERY PLAN"][0];
    results.push({ family, sqlExecutionMs: plan["Execution Time"], planningMs: plan["Planning Time"], networkInclusiveMs: Math.round(performance.now()-start), nodes: nodes(plan.Plan) });
  }
  const host = new URL(env.DATABASE_URL).hostname;
  const region = host.match(/(?:aws|azure)-([^.]+)/)?.[1] ?? host.match(/\.([a-z]{2}-[a-z]+-\d)\.(?:aws|azure)\./)?.[1] ?? "unknown";
  const report = { conditions: "Ten representative reads on two audit learners with 1095 sessions each. Read-only EXPLAIN ANALYZE; not a ranking of every query and not a production-scale load test. Plan filter values and private data omitted.", neonRegionHint: region, pooled: host.includes("-pooler"), storageRegion: env.OBJECT_STORAGE_REGION, vercelRegion: "owner must confirm", upstashRegion: "owner must confirm", results };
  writeFileSync("docs/QUERY_METRICS.json", JSON.stringify(report, null, 2));
  console.info(JSON.stringify({ queries: results.length, maxSqlExecutionMs: Math.max(...results.map(r=>r.sqlExecutionMs)), maxNetworkInclusiveMs: Math.max(...results.map(r=>r.networkInclusiveMs)), neonRegionHint: region }));
} catch { console.error("Read-only query audit failed; no SQL parameters or connection details logged."); process.exitCode = 1; }
