# StudyFlow

Personal LMS built with Next.js 16, React 19, Tailwind v4, next-intl, Neon Postgres, Drizzle, Better Auth with Argon2id, Resend and private Neon Object Storage. Learner content is private; administrators receive account information and study statistics.

## Local setup

Use **Node 24**, the tested backend runtime. Install with `npm ci`.

1. Create a Neon project in a region supporting Object Storage. Create independent development and production branches.
2. Fill `.env.local` using `.env.example`. Preserve the existing local seed settings and generated secrets if that file already exists. Set the development branch's pooled and direct database URLs.
3. Create a **private** storage bucket on that branch. Copy its actual endpoint, region and S3 credentials from Neon Connect -> Storage. Configure bucket CORS for your app origin; see [operations](docs/OPERATIONS.md).
4. Configure Resend with a verified sender. Supply the Redis REST URL/token for production rate limiting. Set long random AUTH_SECRET and CRON_SECRET values and the actual APP_URL.
5. Run:

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Open `/login`. The seeder creates one account from `SEED_USER_EMAIL`, `SEED_USER_PASSWORD`, `SEED_USER_NAME` and `SEED_USER_ROLE`. The role defaults to `super_admin`; choose `learner` for a learner account. This workspace's gitignored local seed configuration contains the account requested by the owner. No dummy subjects, resources or study sessions are inserted.

The seed never resets an existing password or changes an existing account's role. It refuses production execution unless explicitly invoked with `npm run db:seed -- --allow-production`. Use a separate strong production credential. Provisioning cannot run until your actual database connection is configured.

## Configuration

| Variables | Purpose |
| --- | --- |
| DATABASE_URL / DATABASE_URL_UNPOOLED | Pooled app connection / direct migration and seed connection |
| AUTH_SECRET / APP_URL | Session signing secret, at least 32 characters / canonical origin |
| RESEND_API_KEY / EMAIL_FROM | Account email transport and verified sender |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Optional provider configuration; new-user Google consent UI is not shipped |
| OBJECT_STORAGE_ENDPOINT / OBJECT_STORAGE_REGION / OBJECT_STORAGE_BUCKET | Actual branch storage endpoint, signing region and private bucket |
| OBJECT_STORAGE_ACCESS_KEY_ID / OBJECT_STORAGE_SECRET_ACCESS_KEY | Branch-scoped S3 key pair |
| CRON_SECRET | Bearer secret for jobs, at least 32 characters |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | Shared rate limits; required in production |
| SEED_USER_EMAIL / SEED_USER_PASSWORD / SEED_USER_NAME / SEED_USER_ROLE | CLI-only account provisioning inputs |
| TEST_DATABASE_URL / TEST_DATABASE_ISOLATED | Disposable test branch connection / explicit test opt-in |

Optional blank values are ignored. Missing application configuration produces a clear error without printing secrets. Never commit environment files or real credentials. There is no fallback to fake users or browser data.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Development / build / production server |
| `npm run lint` / `typecheck` | ESLint / strict TypeScript |
| `npm test` | Analytics/calendar fixtures plus backend tests |
| `npm run test:e2e` | Playwright route/mobile checks; authenticated flow requires E2E_DATABASE_READY=1 |
| `npm run db:generate` / `db:migrate` / `db:studio` | Generate SQL / apply migrations / inspect a development database |
| `npm run db:seed` | Provision the environment-configured account |
| `npm run check:connections` | Check live database/storage access, migrations and the seed account without printing secrets |
| `npm run check:storage` | Verify private upload/copy/download/CORS and remove only temporary diagnostic files |

Integration tests require a migrated, isolated Neon branch and are explicitly skipped otherwise. Playwright can use installed Edge with `PLAYWRIGHT_CHANNEL=msedge` on Windows. Use a separate APP_URL port if a dev server is already running; browser tests use an isolated build directory.

## Architecture

```text
Localized pages -> server session/role guards -> scoped services -> Drizzle -> Neon
Interactive UI -> shared Zod schemas -> Server Actions -> scoped transactions
File -> signed PUT -> private pending object -> HEAD/copy -> confirmed resource
Signed download <- owner check <- database metadata
Cron -> bearer check -> reminders, timer sweep, storage cleanup, retention
```

`src/lib/db` holds the schema; `drizzle/` holds SQL migrations. `lib/auth`, `email`, `storage`, `rate-limit` isolate infrastructure. `lib/services` owns mutations, projections, lists and jobs. `lib/analytics` contains fixtures and SQL aggregation. `lib/workspace` contains selectors and memory-only optimistic state. Actions live under `app/[locale]`; narrow route handlers live under `app/api`. The source SRS is [docs/SRS.md](docs/SRS.md).

## Deploy and verify

Set Vercel's production variables and Node 24, connect the main branch and final domain, and run migrations as a protected release step before deployment. Previews need an independent Neon branch and matching storage endpoint. Configure Resend's domain, bucket CORS, Redis and CRON_SECRET. `vercel.json` defines job schedules; choose a plan supporting their frequency.

GitHub Actions runs lint, typecheck, tests, build and public browser checks. Internal PRs can provision disposable Neon branches when NEON_PROJECT_ID, NEON_TEST_PARENT_BRANCH and NEON_API_KEY are configured. Deployment credentials are not in this repository.

Read [security](docs/SECURITY.md), [operations](docs/OPERATIONS.md), [backend audit](docs/BACKEND_AUDIT.md) and [backend delivery](docs/BACKEND_DELIVERY.md) for verification limits. Performance targets, full authenticated/file/email E2E behavior, backup recovery and external error tracking have not been verified against real infrastructure. Terms/Privacy are owner placeholders. Decide minimum-age/parental-consent rules before launch.

Arabic, Spanish and German maintain corresponding keys and RTL/dark mode support; some existing secondary copy remains English. The upstream license remains in LICENSE.
