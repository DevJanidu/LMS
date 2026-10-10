# CRUD reliability audit

Date: 2026-10-10. Scope: the actual StudyFlow LMS, including learner, administrative, authentication, onboarding, file and background-service paths.

## Outcome and limits

The reported TypeScript build failure is fixed. `tests/workspace-store.test.ts` now supplies a valid `learningContext` enum value in its profile mutation fixtures; production input validation remains unchanged. The production build and lint pass. The current unit suite has **209 passing tests and 12 skipped tests**. The skipped integration/performance suites require explicit environment setup; a separate fixture-only live database run executed **10 integration tests successfully**.

The final three-account browser/API/database audit has **47 passing checks, zero failures**, against the isolated local production server on port 3100. Three Playwright E2E tests also passed. Confirmed subject, topic, resource, session, profile, notification and calendar mutations survived immediate reload and direct SQL verification. These are grouped workflow checks, not a claim that every possible input and deployment condition has been tested.

The application has received shared reliability fixes, rather than only subject/library patches. Full production certification remains blocked by the environment-dependent checks listed below. No production deployment, new dependency installation or schema migration was performed.

## Discovery and lifecycle review

`scripts/crud-mutation-inventory.mjs` derives its inventory from filesystem routes and TypeScript syntax trees. [CRUD_MUTATION_INVENTORY.json](CRUD_MUTATION_INVENTORY.json) records 216 source files, 40 routes, 14 component folders and the discovered write call sites. This is an audit index; finding a handler does not prove that every branch was executed.

The reviewed lifecycle is UI event → shared mutation journal or calendar/file transport → API/server action → rate limit and live session authorization → owned database transaction → committed canonical response → confirmed cache and pending-layer replay → targeted reads and dependent views.

The existing general mutation service already awaited `db.transaction()`. The baseline confirmed subject/resource creation in the database after the response. There was no evidence that those confirmed transactions were fire-and-forget. Refreshing an unconfirmed optimistic operation, stale reads and a delete handler that sent no mutation were separate issues.

## Reproduced defects and fixes

| Evidence / root cause | Permanent change and regression coverage |
| --- | --- |
| Library deletion hid a paginated record but sent **zero** mutation requests: the diff operated on a different shared array. SQL still contained the row and reload restored it. | Explicit owned delete operation with original-record precondition; after-fix browser test observes one POST, zero matching SQL rows and no row after reload. |
| A create intercepted before reaching the server appeared optimistic without a visible saving/uncertainty state. Reload lost the illusion of persistence. | Shared per-user write status, unload warning and a session-storage uncertainty flag. The after test shows Saving, a reload warning and correctly reports that no write occurred. |
| Successful responses lacked authoritative affected records; locally guessed timestamps, IDs or optional fields could survive until a later read. | Transactions return canonical affected rows, deletion tombstones, timer state and account revision. Cache reconciliation replaces records and clears omitted fields. |
| Pending layers, old reads and account switches could contaminate newer cache state. Browser timestamps were also used as read freshness. | Confirmed base plus independently reversible pending layers; owner/generation-scoped reads; server revisions; guarded completion cleanup. Unit tests exercise out-of-order reads and account switches. |
| An old request completing after A → B → A could remove the newer duplicate-prevention entry. The reproduction dispatched an extra request. | Remove a duplicate token only if it still points to that task. Regression test verifies the expected request count. |
| Subject optimistic deletion detached calendar blocks although the database cascaded their deletion. Topic/subject IDs embedded in exception JSON escaped ordinary foreign-key cleanup. Live integration reproductions failed before the fix. | Shared deletion projection, owned JSON-reference cleanup inside the transaction, canonical exception fields and monotonic affected-block versions. Live SQL regression tests pass. |
| A delayed calendar acknowledgement could replace a newer background-read record. Cached exceptions from a previous series revision could also survive range reads. Both were reproduced with unit regressions. | Compare record revisions; never merge exception sets across different series versions. Unit and real calendar interaction tests cover the changed behavior. |
| Stale forms could overwrite newer values without a server preimage check. | Current UI submits bounded, validated preconditions; the transaction rejects stale changes. Tests cover stale notes, settings and other operation preimages. Legacy callers omitting preconditions retain compatibility; unconditional compare-and-swap is not claimed for them. |
| Authentication, rate-limit outages and unknown write failures lacked sufficiently distinct feedback; query wrappers repeated authorization. | Preserve sanitized failure categories; distinguish 401/403, validation/conflict, security-service unavailable and uncertain transaction errors. Authorize query reads once. Retry only a recognized transient session read/security decision once before a write; never blindly retry ordinary non-idempotent mutations. |
| Partial settings writes could reconcile missing fields incorrectly. File confirmation did not immediately patch the canonical resource. | Read back actual settings and return committed file metadata/revision; targeted reconciliation and unit/integration coverage. |

Password-reset acknowledgement remains deliberately generic to avoid account enumeration. Its translated copy does not promise email delivery. Transient provider failure is logged with a sanitized category. Actual mailbox delivery was not tested.

## Shared cache and mutation ownership

The database is authoritative. Each account's store holds a confirmed base, overlays pending operations immediately and reconciles only after server confirmation. Related records serialize; unrelated operations remain usable. Failure removes the failed layer and replays the others. Forms and paginated deletion handlers carry their original values for transactional stale-write detection.

The canonical confirmation includes affected rows, dependent changes, deletion tombstones and the committed account revision. Read keys include account and generation; older completions cannot evict newer requests. Older server-component data cannot populate current collections just because a field was absent. Collection reads and calendar ranges synchronize in the background. Ordinary CRUD does not refresh the entire workspace.

Saving, Saved, failure and uncertainty are separate states. Saved follows confirmation. Unknown outcomes are not automatically resubmitted. Navigation stays available; unload warns about pending writes. Only an uncertainty marker is stored in the browser, not private mutation payloads. Calendar receipts provide idempotent retry for its existing command protocol; ordinary CRUD does not have a durable outbox or exactly-once receipt.

Authorization remains live and owner-scoped. Tiny global policy reads use request-local caching; aggregate caches carry database revision fences rather than trusting Redis invalidation alone. Quota checks and related writes stay in the transaction. No authentication bypass or global cache disable was introduced.

## Module-by-module checklist

All discovered component folders and route families were reviewed. The following table separates executable evidence from remaining limitations.

| Module / discovered folders | Reviewed behavior | Executed evidence / limits |
| --- | --- | --- |
| Dashboard (`dashboard`) | Focused data, counts, recent activity, timer entry points and dependent invalidation | Three-account navigation, history/analytics synchronization and shared-store tests. |
| Subjects and topics (`subjects`) | Create/edit/delete, topic batches/completion, detail reads, dependency cascades and stale forms | All three accounts CRUD → confirmation → reload → SQL; 200-topic workload; owned foreign-reference and JSON-cascade integration tests. |
| Planner/calendar (`calendar`) | One-off/recurring CRUD, occurrence/series changes, resize/drop, receipts, ranges and versions | Three-account SQL checks; dedicated real browser gestures, injected failure/retry, mobile/dark/reduced-motion; calendar unit regressions. |
| Study/history (`study`) | Manual sessions, timer start/pause/resume/finish, historical totals and stale edits | All three accounts; live duration/idempotency tests; Playwright waits a real 61 seconds and verifies saved history after reload. Short audit timers intentionally exercise the short-session discard rule. |
| Library/notes/files/links/videos (`resources`) | Paginated CRUD, attachment ownership, upload confirmation, download and deletion | Every resource kind under all three accounts; exact uploaded download contents, SQL/reload checks and foreign download denial. Storage deletion is queued; physical object purge was not certified. |
| Goals/progress/analytics (`analytics`) | Existing weekly targets, subject/topic progress, history aggregation, localized-day metrics | Profile/session/topic dependent views, analytics tests, large dataset and representative EXPLAIN ANALYZE. No standalone task/goal CRUD module exists in the discovered app. |
| Profile/account settings (`settings`) | Profile/theme, stale state, localized pending/errors, export and account deletion | Three-account profile SQL/reload, dialog/theme failure test, export isolation, E2E account deletion. |
| Shell/notifications (`studyflow`) | Shared status, active timer, notification reads and confirm dialogs | Three-account notification confirmation; timer E2E; uncertainty/navigation and overlapping-dialog tests. |
| Authentication (`auth`) | Register/login, session guard, inactive accounts, reset acknowledgement, error categories | Three fresh registrations; expired-session 401/no write; ownership and inactive-account integration; public/private E2E; auth unit tests. Email-token/OAuth delivery flows blocked below. |
| Onboarding (`onboarding`) | Steps, final committed profile/subject/topic save, retry and duplicate protection | Fresh accounts and Playwright injected final-save failure/retry; no duplicate subject/topic. |
| Administration (`admin`) | Overview, users/detail/status, analytics/storage reads, global policy mutations | Admin role/ownership and fixture user-status integration; settings transaction/precondition unit tests. Live shared policy changes blocked below. |
| Shared primitives (`common`, `form`, `ui`) | Read/event wiring and dialog/input states used by feature modules | Source review and browser workflows. These folders own no independent persistent collection. Exhaustive visual combinations were not tested. |
| API/background services | Workspace/query, calendar, auth, files, export, health and four cron endpoints | Source authorization/error/caching review; foreground endpoints exercised above. Full destructive cron sweeps blocked below. |
| Public/static/legal/error routes | Navigation/rendering and access boundaries | Production build, public/private E2E and translation key parity. No CRUD exists on these pages. |

## Tests executed and database verification

| Command / test | Result |
| --- | --- |
| `npm.cmd run build` | PASS, including TypeScript and 120 generated static pages; isolated production build also passed. |
| `npm.cmd run typecheck` | PASS after the reported enum-fixture build fix. |
| `npm.cmd run lint` | PASS on final reliability source. |
| `npm.cmd test` | PASS: 209 Vitest tests; 12 environment-dependent skips. Also 13 analytics assertions and 506 translation-key parity checks. |
| `node scripts/test-current-database.mjs --acknowledge-current-test-database` | PASS: 10 live fixture-only database integration tests. |
| Playwright workspace suite with external port-3100 production server | PASS: 3 tests, zero skipped/flaky/unexpected results, about 136 seconds. [Results](CRUD_E2E_RESULTS.json). |
| `node scripts/crud-reliability-audit.mjs --acknowledge-current-test-database --url=http://localhost:3100` | PASS: 47 grouped three-account checks, zero failures; [results](CRUD_RELIABILITY_RESULTS.json). |
| Baseline/after persistence and pending-refresh scripts | Defects reproduced before fixes; after results PASS: [persistence](CRUD_RELIABILITY_AFTER.json), [pending refresh](CRUD_PENDING_AFTER.json). |
| Dedicated calendar browser audit | PASS again after the final exception-cache fix, including create, recurring edits, rapid moves, resize, rollback/retry and navigation. [Results](CRUD_CALENDAR_RESULTS.json). |
| Dialog response-race audit | PASS: four checks, with stubbed writes; UI race coverage, not database persistence proof. [Results](DIALOG_PERFORMANCE_RESULTS.json). |
| Read-only query audit and service diagnostics | Executed: ten representative SQL plans and sampled DB/Redis/auth reads. [Query results](CRUD_QUERY_AFTER.json), [diagnostics](CRUD_SERVICE_DIAGNOSTICS.json). |

The new, active and stress personas are freshly registered independent UUID accounts. The active persona contains 200 topics, 3,000 sessions and 125 resources. Each CRUD workflow checks the committed database directly as well as reloading the UI. Stress tests include concurrent writes, rejected stale edits, a lost response after a real commit, known rejection rollback and expired sessions. The lost-response case confirms one write, continued navigation and an uncertainty warning; it does not treat the missing response as Saved.

Fixture mutations are restricted to audit accounts. Main persona cleanup passed for all three accounts, and a separate restricted cleanup check found no remaining persona users. No owner account, shared global setting or production cron sweep was mutated.

Earlier audit runs accidentally inherited `.env.local`'s port-3000 development URL after environment loading. Development hot reload produced misleading intermittent errors. Those artifacts now explicitly identify development conditions; the scripts use explicit/default port 3100 and the complete 47-check audit was rerun against the built production server. Development baseline measurements remain useful reproductions, but are not production performance comparisons.

## Performance evidence

| Measurement | Before | After / interpretation |
| --- | --- | --- |
| Library delete request / refresh / SQL | 0 requests; row returned; SQL count 1 | 1 request; row absent after reload; SQL count 0. |
| Pending create intercepted before server | No Saving or reload uncertainty warning | Saving and uncertainty warning; correctly no persisted record. |
| Authoritative subject/resource confirmations | Canonical rows absent from response | Canonical rows present; direct SQL verification passes. |
| SQL execution maximum across ten representative reads | 4.138 ms | 3.827 ms. Small fixture sample; not proof of a material speedup. |
| Subject confirmation plus SQL read | 7,141 ms on development baseline | 8,654 ms on production after sample; different conditions, not comparable as an optimization benchmark. |
| Resource confirmation plus SQL read | 5,800 ms on development baseline | 3,640 ms on production after sample; same limitation. |

The final production three-account audit records 81 mutation HTTP timings, roughly 2.18–5.33 seconds. Remote-service/network latency remains material despite immediate optimistic feedback. The final dedicated calendar run observed 65–81 ms optimistic create/drop and 49 ms cached week navigation; gesture frame sampling missed some drops, so universal frame-budget compliance is not claimed. The stress lost-response check observed optimistic feedback around 184 ms while allowing navigation.

Representative SQL execution was low milliseconds, while network-inclusive query latency reached 2,341 ms. The configured Neon region is us-east-2. Deployment/Redis regional placement must be verified before setting production latency SLOs. No artificial waiting was added to make persistence appear correct.

## Files changed for reliability

The workspace also contains earlier performance work. This list identifies the reliability changes without attributing all pre-existing dirty files to this follow-up.

- Shared infrastructure: `src/lib/workspace/{confirmation,mutations,preconditions,store,transport,write-status}.ts`; `src/lib/calendar/{store,useCalendar}.ts`.
- Transactions/reads/uploads: `src/lib/services/{mutations,mutation-records,workspace-reads,focused-workspace,workspace,uploads}.ts`; `src/lib/cache/index.ts`.
- Security/transports: `src/lib/auth/{index,errors}.ts`, `src/lib/rate-limit/index.ts`, `src/app/api/workspace/{route,query/route}.ts`, auth/calendar routes, localized actions/auth-actions/file-actions.
- Consumers: resource/session/subject modals and list/detail handlers; calendar, settings, shell, user-status action and active timer components. Existing UI design is preserved; saving/error wording is translated in all four message dictionaries.
- Regression suites: CRUD/journal/store/route/settings/calendar/auth/cache/rate-limit/integration tests and `tests/e2e/workspace.spec.ts`. The latest build fix is in `tests/workspace-store.test.ts`.
- Reproducible audit tooling: `scripts/crud-*.mjs`, calendar/dialog audits and fixture-only database runner; accompanying `docs/CRUD_*.json` artifacts.

## Remaining issues and blocked checks

1. **Isolated global database tests:** No isolated `TEST_DATABASE_URL`, Neon branch credentials or local PostgreSQL/Docker service is configured. Changing shared platform policy or running retention/reminder/storage/timer cron sweeps could affect unrelated data. Those live checks were not executed; policy transactions have unit coverage, cron paths have source review. Provide an isolated branch to complete destructive global integration/E2E tests.
2. **Email/reset/OAuth:** No safe mailbox/provider test setup was available. Real password-reset token delivery, email verification and external OAuth round trips remain untested. Generic reset acknowledgement deliberately preserves privacy rather than confirming delivery.
3. **External authentication availability:** Error classification and bounded safe recovery are covered, and sampled final service reads succeeded. This does not establish permanent Neon/Redis/auth-provider availability or reproduce every historical intermittent outage. Deployment logs/regions are required to diagnose remaining external latency/outages.
4. **Interrupted ordinary writes:** Pending/uncertain intent is clearly indicated, but ordinary CRUD has no durable offline outbox. A user overriding the unload warning can abandon a queued operation before dispatch. An unknown commit requires checking current data; it is not blindly retried. Calendar's existing receipts support its own idempotent retry.
5. **Scale and visual coverage:** The executed workload is substantial fixture coverage, not an exhaustive distributed load test, production SLO certification or every RTL/theme/input combination. No claim is made that every interaction meets a universal latency target.
6. **Physical file cleanup:** Owned resource persistence/download/delete and cleanup queuing were tested. Physical object purge through the global cleanup job was not executed on the shared environment.

Confirmed writes in the tested foreground modules remain correct after immediate refresh. The unresolved items above are explicitly excluded from a claim that the entire application is fully production-certified.
