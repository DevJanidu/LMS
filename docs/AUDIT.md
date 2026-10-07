# Full-system audit — 7 October 2026

Source of truth: [Final SRS](SRS.md). Initial revision recorded before application changes. Source review is evidence of an implementation or defect, **not proof that a live-provider flow passes**. The owner approved audit/cache dependencies and testing the current connection; existing records must never be reset or removed. No schema changes are authorized.

## Baseline and measurement conditions

- Node 24.21.0; installed Next.js 16.3.8; Windows; production Turbopack build.
- Baseline lint and typecheck pass. `npm test`: 13 Node tests + 20 Vitest tests pass; four database integration tests skipped without isolated-test configuration.
- Baseline production build passes (compile 12.2 s, TypeScript 3.7 s, static generation 1.8 s).
- `npm run start -- --port 3100` fails its instrumentation hook because both Upstash variables are absent. This is the intended fail-closed production security behavior. No browser performance numbers can be claimed from that server.
- Initial npm advisory request failed in the network sandbox; retry with network approval is pending.
- No login performance subtask document exists. Existing backend-integration prompt is untracked owner content and is left untouched.

## Findings

Severity represents impact, not confidence. Reproductions below distinguish source evidence from execution. Initial statuses remain Deferred until a regression test or measurement proves a fix. Needs decision includes missing provider configuration. File lines refer to the initial revision and may move after fixes.

| ID | Area | Severity | Symptom / reproduction | Root cause | Files / initial lines | Proposed fix | Status / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OPS-01 | Production / performance | High | Build passes; start fails before serving pages | Production Redis security credentials missing | `src/lib/env.ts:37`, `src/instrumentation.ts:4` | Owner supplies real Redis credentials; preserve production hard failure | Needs decision — observed startup failure |
| SEC-01 | Upload authorization | High | Deactivate after action guard but before upload transaction; service still creates/commits upload | Upload locks account ID but never checks active status or learner role in transaction | `src/lib/services/uploads.ts:18,37` | Validate locked actor on both reserve and confirm; regression test concurrent/stale actor | Deferred — source |
| SEC-02 | Rate limiting | Medium | Two fixed-window bursts can permit double allowance; Redis exception becomes generic auth failure | Handwritten fixed window; 5 s Redis timeout; no dedicated SDK or explicit deny-on-error handling | `src/lib/rate-limit/index.ts:6-20` | Sliding-window limiter, separated namespaces, bounded timeout; deny security requests on outage | Deferred — source |
| PERF-01 | First paint / theme | High | Set dark preference; initial HTML has no theme class; theme changes in effect | Theme applied after hydration; html lacks background and hydration suppression | `src/app/[locale]/layout.tsx:47`, `src/context/ThemeContext.tsx:62`, `src/app/globals.css:216` | Blocking head theme script, token backgrounds on html/body, hydration suppression; test before hydration | Deferred — source; black frame not yet measured |
| PERF-02 | Login navigation | High | Auth success calls push and refresh; session hook blocks on last-active update | Extra client router work and noncritical synchronous write | `src/components/auth/AuthForm.tsx:44`, `src/lib/auth/index.ts:55`, `src/app/[locale]/auth-actions.ts:32` | One server redirect outside catch; pending lock; defer last-active with `after()`; safe role destination | Deferred — source |
| NAV-01 | Return path / locale | Medium | Open `/subjects/<id>?tab=resources` while logged out: destination is plain `/login` | Proxy discards URL and locale; server guard also loses return path | `src/proxy.ts:10`, `src/lib/auth/index.ts:68` | Preserve validated internal return path and locale; reject open redirects and wrong-role destinations | Deferred — source |
| PERF-03 | Dashboard query waterfalls | High | Layout loads whole workspace before chrome; aggregates run after row loads in sequence | Compatibility loader includes every feature; rereads guarded user; separate ranked/exception/analytics/statistics waits; read path writes streak | `src/lib/services/workspace.ts:20-64`, `(learner)/layout.tsx:19` | Reuse request user, parallelize independent work, nonblocking streak preservation; stream shell with useful skeleton | Deferred — source; baseline approximately 18 service queries plus auth, conditional streak write adds 3 |
| PERF-04 | Lists / payload | High | Every route ships up to 10k resources incl. 100k note bodies, 10k blocks, 200 session notes; admin 50k sessions | Workspace shape is used as a universal client data layer; resource/admin pagination only slices in browser | `src/lib/services/workspace.ts:27-44`, `src/components/resources/Resources.tsx:72` | Screen-specific DTOs and server pagination; load private text only on authorized detail reads | Deferred — source; scope requires coordinated UI migration |
| CACHE-01 | Shared computed reads | High | Each load repeats learner daily aggregates, progress and admin KPI queries | Only React request dedupe and process-local settings exist | `src/lib/services/workspace.ts:16,112`, `src/lib/analytics/server.ts:20`, `src/lib/analytics/platform.ts:19` | Shared typed Redis module; versioned per-user aggregate keys, short TTL/local-midnight rollover; never auth/timer/private text | Deferred — source |
| CACHE-02 | Settings consistency | Medium | Change settings on one server; another retains old limits for 60 s | Process-local settings invalidation | `src/lib/services/workspace.ts:16`, `src/app/[locale]/actions.ts:16` | Shared generation invalidation after commit; request dedupe only; include setting version in analytics keys | Deferred — source |
| PERF-05 | Full polling / races | Medium | Focus/30 s triggers full workspace on each client mount; older refresh can overwrite newer state | Live data and whole workspace mixed; no in-flight dedupe or mutation revision | `src/lib/workspace/store.ts:65-73` | Dedupe and discard outdated reads; narrow live timer/notification data later | Deferred — source |
| NAV-02 | Navigation refreshes | Medium | Logout, onboarding completion and account deletion call push + refresh | Cookie/data navigation spread over client and actions | `WorkspaceHeader.tsx:218`, `Settings.tsx:204`, `OnboardingWizard.tsx:116` | Server redirects at successful terminal actions; preserve redirect exceptions | Deferred — source |
| UX-01 | Search state | Low | Type new query: previous hits remain until request finishes; invalid query throws | No immediate clearing / safe parse | `WorkspaceShell.tsx:84`, `src/app/[locale]/actions.ts:52` | Clear stale hits; safe validation and friendly failure; preserve cancellation | Deferred — source |
| QA-01 | Production E2E / CI | High | E2E config starts next dev; quality CI builds then still tests dev | Development webServer and no production Redis fixture | `playwright.config.ts:6`, `.github/workflows/backend.yml:23,51` | Production webServer; explicit test-only Redis emulator or real isolated Redis; fail on missing required E2E config | Deferred — source |
| QA-02 | Coverage | High | Existing E2E covers signup/topics/timer but skips provider flows; no axe/Lighthouse/cache tests | Audit tooling and full matrix absent | `tests/e2e/workspace.spec.ts:14`, `tests/ownership.integration.test.ts:5` | Add meaningful regressions, production evidence, requirement matrix; clearly report skips | Deferred — baseline |
| DATA-01 | Indexes / provider distance | Medium | Query plans, pooled URL, three deployment regions not yet verified | Hosting settings not available; initial queries use local-date expressions | `src/lib/db/schema.ts`, `src/lib/analytics/server.ts:24`, `src/lib/services/lists.ts:12` | EXPLAIN ten real queries on test fixtures; report region metadata; ask before index/schema changes | Needs decision — no schema changes without approval |
| DATA-02 | Seeding safety | Medium | Seeder only provisions account/settings; production guard depends on NODE_ENV/VERCEL_ENV | No explicit branch identity guard or year-long performance fixture | `scripts/seed.mjs:14` | Require explicit development target acknowledgement; isolated UUID fixtures; never overwrite owner seed account | Deferred — source |
| SEC-03 | CSP / dependencies | Medium | CSP allows inline JS/styles; full advisory audit pending | Current framework/style integration; strict nonce rollout not tested | `next.config.ts:32`, `package-lock.json` | Review advisories; maintain headers; document nonce decision and trusted proxy | Needs decision — CSP policy; registry audit pending |
| OPS-02 | Launch configuration | High | Password reset unavailable; legal pages explicitly placeholders | Email/domain/policy/error-tracking not provisioned | `docs/OPERATIONS.md:7`, `(public)/terms/page.tsx`, `(public)/privacy/page.tsx` | Owner verifies email/domain/legal policies, provider regions, backup restore, cron and release migration pipeline | Needs decision — do not fabricate launch readiness |
| A11Y-01 | Accessible proof | Medium | No axe sweep or recorded keyboard walkthrough | Existing focus trap/reorder buttons/reduced motion help but are not validation | `src/components/ui/modal/index.tsx`, `TopicList.tsx:169`, `workspace.css:387` | Axe sweep main routes at four widths/two themes; keyboard checks/tap targets; fix observed failures | Deferred — source |
| CODE-01 | Obsolete verification tools | Low | Old browser scripts assert localStorage mock entities and fabricated IDs | Tools predate backend integration | `scripts/browser-check.mjs:151`, `scripts/polish-audit.mjs:43` | Replace/remove obsolete mock checks; make current production tests authoritative | Deferred — source |

## Cache inventory before changes

| Layer | Current behavior | Assessment |
| --- | --- | --- |
| Upstash | Rate-limit EVAL only, fixed window, hashed identifier | No data cache; security must remain fail closed |
| React.cache | `requireUser`, `getWorkspace` | Request-scoped and appropriate; loader still rereads user |
| In-memory | settings 60 s, development fixed-window limiter, browser workspace snapshot | Settings stale across instances; workspace not persisted but has refresh races |
| Next rendered data | Actions invalidate `revalidatePath('/', 'layout')` | Broad invalidation; authenticated pages are dynamic, no global user page cache |
| `use cache` / unstable_cache / tags | None found | No existing cross-user shared page cache to repair |
| Fetch | Rate limiter uses no-store; storage upload direct | Correctly avoids caching secrets/signed URLs |
| HTTP | File redirect/export private no-store; health/cron no-store | Authenticated HTML currently receives Next dynamic defaults; explicitly verify responses |
| SWR/TanStack Query | None | Do not introduce another dependency without demonstrated need and approval |

Expensive uncached reads: full workspace, learnerAnalytics (3 SQL queries), subjectStatistics (1 SQL aggregate), platformAnalytics (4 SQL queries), calendar expansions, subject progress, user/session lookups and app settings. Search is user-scoped SQL limited to 20 per entity and should remain uncached. Numeric database latency/hit rate require provider execution and production serving; they are not inferred from code.

## SRS / route and edge-case coverage

All SRS route families exist: login/register/reset, onboarding steps, dashboard, subjects/detail, study/history, calendar, analytics, resources, learner settings, admin overview/users/detail/analytics/storage/settings, localized not-found/error boundaries, Terms and Privacy. Admin audit log is embedded rather than a separate route. Persistent learner/admin shells exist; loader latency gates them. Dynamic-detail-specific error boundaries use ancestor fallback; review UX in browser.

| Requirement family | Initial evidence | Remaining proof |
| --- | --- | --- |
| AUTH-01–12 | Better Auth, validation, server roles, reset transport, deletion cascade, policy acceptance, optional email/Google configuration/export | Full cookie/session/cross-role/return-path E2E; real email; AUTH-10/11 are SHOULD, not claim enabled |
| Onboarding / dashboard | Skippable steps, server completion gate, topic/study selectors | First subject to timer under two minutes; empty and year-long fixture |
| Subjects / topics | Ownership chain, 50 active-subject and 200-topic guards, completion timestamps, optimistic reorder, keyboard buttons | Duplicate/long/special titles, large-list pagination and cross-user attempts |
| Resources | HTTP(S) URL validation; MIME-extension agreement; reserved quota; immutable confirmation key; download ownership; private note rendering | Real signed URL expiry/type/size/100 MB quota and cascade storage cleanup |
| Timer / sessions | Server timestamps and account lock; unique timer PK; finishSnapshot; session schema; paginated history | Cross-tab race, refresh/reopen, <60 s discard, six-hour confirmation, notes privacy; timer pause allocation approximates midnight split |
| Analytics / goals | 13 passing pure tests: rounding, thresholds, midnight, DST, week start, recurrence | SQL parity on current DB; historical-streak persistence; timezone changes; fresh cache/midnight rollover |
| Timetable / calendar | Recurrence exceptions and future split represented; overnight/DST recurrence tests pass | Real one-only/all-future mutation, deadlines, overlap warning and keyboard operation |
| Search / reminders / settings | SQL ownership filters, secured idempotent cron unique keys, profile schema, exports/deletion | Cron concurrency/coverage at scale, focus cancellation, settings persistence and real email |
| ADM-01–10 | Server admin guard; explicit private-text omission; SQL KPIs; status revoke + audit | Learner denial, target-specific statistics accuracy, >1000 users and >50k sessions, CSV completeness |
| Data / operations | UTC timestamptz, composite ownership FKs, cascades, five migrations, server-only DB/auth/services/storage/email | Fresh-branch migrate, rollback rehearsal, query plans, region match, bucket CORS, backup restore |
| UX / accessibility | Localized copy in four locales, logical styles, dark mode, focus/reduced motion, matching group skeletons | Main-page axe and manual keyboard, all widths, contrast/touch/overflow, timer live announcements |

Each requirement is tracked as source-reviewed until corresponding execution exists. Pure tests do not prove database/route authorization. No private learner text should be returned to admin SQL or cached. No data model changes will be made as part of this audit without owner approval.

## Before / after metrics

| Metric | Before | After |
| --- | --- | --- |
| Production boot | Fails: missing Redis credentials | Pending |
| Login → dashboard / shell / redirects | Not measurable; push + refresh source path | Pending |
| TTFB / FCP / LCP / TBT | Not measurable: production boot blocked | Pending |
| Per-route JS / Lighthouse | Not measured | Pending |
| Dashboard DB queries | ~18 loader queries + auth, conditional streak write (source count) | Pending instrumentation |
| Ten slowest SQL plans | Not measured | Pending safe fixture run |
| Cache hit rate | No shared data cache | Pending |

## Phase commits and verification

Phase 1: this baseline report. Application code is unchanged at the time of report creation. Subsequent phase results must append exact commands, pass/fail/skip counts, artifact paths and commit IDs. Deferred items must remain visible rather than being labeled fixed through source inspection alone.
