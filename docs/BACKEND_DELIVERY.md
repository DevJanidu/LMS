# Backend delivery

This implements the database-backed LMS workflow and removes runtime mock data. Infrastructure provisioning, live-provider tests and production performance validation remain necessary before claiming production readiness.

## Routes and actions

The existing localized learner/admin routes now load authenticated data. Learner and admin layouts/pages enforce their respective roles, onboarding requires a learner, and subject/user IDs are validated before detail rendering. Public login, register, reset-password, Terms and Privacy remain available without a session. All groups have loading/error/not-found boundaries.

| Entry point | Behavior |
| --- | --- |
| `authenticate`, `signOut` | Better Auth email/password registration/login/reset/logout; Terms/DOB validation and rate limits |
| `mutateWorkspace` | Typed subject/topic/resource/manual-session/block/profile/admin-settings/status/notification/timer operations |
| `refreshWorkspace`, `querySessions`, `queryBlocks`, `searchWorkspace` | Scoped reads, server history pagination, server recurrence expansion and parameterized search |
| `completeOnboarding`, `deleteMyAccount` | Persist setup completion / remove the account and queue file removal |
| `createUpload`, `finishUpload` | Reserved quota, short-lived PUT, HEAD validation and immutable final resource |
| `/api/auth/[...all]` | Better Auth handler with origin/rate checks |
| `/api/files/[id]` | Ownership-checked, five-minute attachment download |
| `/api/export` | Current learner's JSON export |
| `/api/health` | Database reachability; generic 503 on failure |
| `/api/cron/reminders`, `/timers`, `/storage`, `/retention` | Bearer-secured background jobs; schedules in vercel.json |

Mutations are serialized per authenticated account using a database row lock. Timer commands ignore browser timestamps/durations and atomically create a session and remove the timer. Sessions under one minute are discarded; unanswered checkpoints are capped, with unattended time excluded from the session's end timestamp. Topic deletion detaches optional references and preserves study history/materials; subject/account deletion cascades and schedules object cleanup.

## Schema and migrations

18 tables: users, user_preferences, sessions, accounts, verifications, auth_rate_limits, subjects, topics, resources, active_timers, study_sessions, schedule_blocks, schedule_exceptions, notifications, audit_logs, app_settings, pending_uploads, pending_object_deletions.

UUID keys, UTC timestamptz columns, enum statuses/roles, nonnegative size/duration checks and end-after-start checks are generated in Drizzle migrations. Unique user email, auth tokens, account/provider identities, reminder deduplication keys and block/date exceptions are enforced. The timer user primary key enforces one timer per learner. Composite subject/user and topic/subject foreign keys reinforce ownership/membership. Indexes cover owners, subjects, topics, session start time, schedule time, topic ordering, audit date and trigram title searches. SQL triggers retain pending storage deletions through cascades.

The owner approved Argon2 password hashing, the SRS's empty-topic progress behavior, optional recurring-exception overrides, and a permanent highest-streak preference. The highest streak is updated by server calculations, including before/after history changes, and cannot be edited by clients.

## Verification

Final automated results are recorded in the conversation; run these commands in this checkout:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
npm audit --omit=dev
```

The local checks include 13 existing analytics/recurrence fixtures and 16 backend unit cases covering signed upload enforcement, safe CSV output, URL/upload validation, birthday-based age checks, time zones, midnight, DST, permanent streaks/goals, timer cap/pause/discard and Argon2 verification. Four integration cases are skipped until TEST_DATABASE_URL and TEST_DATABASE_ISOLATED=true are supplied. The public Playwright route/mobile test passed on installed Edge; the authenticated workflow is skipped without E2E_DATABASE_READY. The seed CLI correctly reports the missing DATABASE_URL_UNPOOLED, without printing credentials. No database account was inserted in this run.

Compatible dependency updates moved Next.js to 16.3.8 and removed the critical audit finding. The audit still reports nine findings (five high and four moderate) in the ESLint/Drizzle tool chains. `npm audit --omit=dev` includes four moderate findings because Better Auth declares drizzle-kit as an optional peer. No automatic major downgrades were applied. Resolve the remaining toolchain advisory ranges before launch; do not interpret them as fixed.

| Security check | Result |
| --- | --- |
| Authentication, role and ownership guards | Implemented; cross-account live tests pending |
| Server-side input validation | Shared Zod domain schemas; signup hook also validates direct API registration |
| Client secrets | No secret configuration strings found in the generated static bundle scan |
| Headers and origin protection | Implemented; public browser route checks passed |
| Rate limiting | Redis-backed production wrapper; local fallback only outside production |
| File type/size/quota and signed downloads | Implemented; live bucket verification pending |
| Logging | No credentials/URLs/content in application logs; auth logger disabled |
| SQL safety | Parameters bound through Drizzle; no client SQL concatenation |
| Dependency audit | Remaining findings disclosed above |
| Private admin content | SQL projection omits private text; deliberate access stub rejects |

## Owner setup

1. Create Neon project/branches; choose a storage-supported region. Keep development/preview separate from production.
2. Fill `.env.local` from `.env.example`, preserving the supplied local seed credentials and generated secrets. Set pooled DATABASE_URL and direct DATABASE_URL_UNPOOLED for the development branch.
3. Create a private bucket and copy the actual branch S3 endpoint, region and credentials. Configure allowed CORS origins. Never expose credentials to the browser.
4. Verify the sending domain in Resend; configure EMAIL_FROM and RESEND_API_KEY. Configure production Upstash Redis credentials.
5. Run `npm run db:migrate`, then `npm run db:seed`. The local seed configuration creates the requested account with the default super_admin role. An existing account is left unchanged. No demo learning data is inserted.
6. Configure Vercel's Node 24 runtime, domain, environment values and CRON_SECRET. Run protected production migrations before deployment; configure the Git integration to deploy main.
7. Configure GitHub NEON_PROJECT_ID, sanitized NEON_TEST_PARENT_BRANCH and NEON_API_KEY to enable disposable-branch integration/authenticated browser checks.
8. Replace legal placeholders, decide age/consent/launch policies, and execute file/email E2E, load tests, EXPLAIN review, backup restore drill and error-reporting setup.

## Remaining limits

The existing UI compatibility loader still fetches bounded workspace batches; server pagination has been wired for session history, while other lists retain client pagination/filtering or bounded snapshots. Learner analytics, subject aggregates, targeted admin learner statistics and platform KPIs are queried in SQL. Platform range cohorts still use bounded activity records. Learner page payloads contain recent sessions plus three recent rows per subject rather than the whole year; history pagination and full exports query all owned records separately. Full pagination at larger account volumes and the specified 50k-session/two-second performance targets need further validation/optimization.

Paused sessions crossing midnight distribute valid duration proportionally over their interval, matching the existing tested analytics behavior; individual pause intervals are not retained. Current streaks are calculated from sessions and longest streaks preserve the server-managed historical maximum. The minimum registration age is configurable and initially unset (0); the owner still needs to decide the policy and parental consent. Optional Google new-user consent/verification UI, external error reporting and live deployment are not completed. PII-free structured request/job failures are recorded through Next.js instrumentation. Production migration/deployment credentials and protected release wiring must be configured externally.

The work was developed and checked as one integrated change; phase-by-phase commits/checkpoints from the prompt were not produced. Do not claim those intermediate snapshots were independently verified.
