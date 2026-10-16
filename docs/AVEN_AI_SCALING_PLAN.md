# Aven scaling plan

The target is growth toward one million **registered** users, not one million concurrent
users, at a cost that fits today's scale. Nothing here claims one-million-user readiness;
the measured evidence is listed in section 2.

## 1. Current architecture and why it scales

| Concern | Today | Scaling property |
|---|---|---|
| App servers | Next.js on Vercel functions (Fluid Compute), stateless | Horizontal; no session affinity |
| Database | Neon Postgres, pooled serverless driver | Every Aven query is user-scoped and indexed (`*_user_idx`, `owner_*_idx`, `ai_proposals_owner_status_idx`, `notification_preferences_check_idx`) |
| Chat context | ≤ 5 goal titles, ≤ 12 messages (byte-bounded), routed tool subset | Context stays fixed per turn regardless of workspace size |
| Mention search | `ILIKE` within the user's own rows, ≤ 41 rows per type per page, 90 requests per minute | Bounded by account size, not user count |
| Proactive monitoring | Deterministic SQL in `processAvenUser`, batches of 8 users, 35 s budget per run, claimed with `FOR UPDATE SKIP LOCKED` on `next_check_at` | Safe to overlap; throughput scales with run frequency and parallel runs |
| Learning alerts | Evaluated once a day per user, in a 15-minute window | At most about 3 evaluations per user per day |
| Delivery | Leased database worker, retries with backoff, idempotent Resend keys | At-least-once with deduplication |
| AI spending | Per-user, global, token and rate budgets reserved before calls | Model calls only on student requests; reminders are templates |

## 2. Measured evidence

- **Deterministic engine:** about 1.1–1.3 ms CPU per learner (2,000 synthetic learners × 5
  goals × 20 tasks × 35 topics; no DB, no model; `tests/learning-performance.test.ts`).
  For one million learners with one daily evaluation, that's roughly 20 CPU-minutes a day
  for the engine itself.
- **Tool context per routed turn:** about 13.7 KB (about 3.4k tokens) against 54.5 KB
  (about 13.6k tokens) when every tool is sent; 75% less on the 24-request benchmark, and
  about 59% averaged over the 113-case evaluation. On held-out phrasings, 28 of 40 requests
  fell back to every tool, so real savings depend on traffic.
- **Not measured:** database latency under load, Neon connection limits, provider latency,
  and end-to-end throughput of the scheduler at scale. Those need a staging database and
  synthetic users, which weren't available.

## 3. Thresholds and next steps (spend only when needed)

| Signal | Action |
|---|---|
| The scheduler often reports `remaining: true` | Call `/api/cron/aven` more often or in parallel (claims are already concurrency-safe) |
| Delivery backlog grows (`notification_deliveries` pending age > 10 min) | Move delivery to a durable queue (Vercel Queues) with the existing idempotency keys |
| Mention search p95 > 150 ms | Add `pg_trgm` GIN indexes on titles (migration) or a cached per-user index |
| Neon connection pressure | Use the pooled endpoint everywhere (already the default) and cap function concurrency |
| AI cost per active user rises | Lower `AVEN_MAX_OUTPUT_TOKENS`, route more turns to subsets, and summarize history sooner |
| `ai_messages`, `audit_logs` or `scheduled_check_ins` growth | Retention already prunes check-ins and notifications after 90 days; add partitioning by month for audit logs past about 50M rows |

## 4. How to load-test before claiming capacity

1. Provision a staging Neon branch, apply migrations and seed N synthetic learners with a
   script (no production data).
2. Run `processAvenUser` against them with mocked delivery providers. Measure runs per
   minute and p95 database time.
3. Run chat turns with a mocked OpenAI endpoint (a local SSE stub). Measure server latency
   and database round trips per turn.
4. Increase N until p95 targets fail, then record the numbers in this file.
