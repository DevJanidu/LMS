# Acadence deployment guide

## Verified architecture and baseline

The application uses npm/Node **24.x**, Next.js 16, Drizzle's Neon serverless Pool, Better Auth with Argon2id, Resend, Upstash REST Redis, and private S3-compatible Neon object storage. Drizzle SQL and its migration journal live in `drizzle/`. Existing unit, gated integration, and Playwright browser tests are available. There is currently **no payment provider adapter** (`getBillingProvider()` returns null), so checkout cannot charge customers; `BILLING_ENFORCEMENT` only controls server entitlements.

On 2026-10-13, GitHub's successful Vercel status associated production deployment `dpl_CmawjZnwNRA7udswUsEZVfnbvjzj` with main SHA `f4fd7adb554d33b174a1aceab2974cebdb54f717`. The live `https://acadence.janidudev.com` HTML reported that deployment ID, and `/`, `/login`, and `/api/health` returned 200 (`health.ok=true`). The owner confirmed main SHA `f4fd7ad` and project **acadence**. GitHub also reports successful deployments for **lms** and **lms-jkij**; the live HTML ID matches the **lms** status link. All three deployment records use the same verified source SHA. Resolve this project/domain association in Vercel before editing hosting settings. Successful GitHub deployment records alone do not prove account permissions or configuration for these projects.

No Vercel or Neon management credential was available. Existing production env files and services were preserved. Do not delete/disconnect the other projects until domain ownership and their purposes are verified. Their GitHub deployment labels are existing telemetry; this workflow provisions no extra application environment or hosting project.

## Provision the three service sets

1. In the existing Neon project's Branches screen, retain the production branch/endpoint unchanged. Create branches named `development` and `staging` with **schema only / no data**. If this option is unavailable, create empty nonproduction projects and apply the committed migrations. Never use the default schema-and-data clone, branch reset from production, or production exports. Git branches do not provision Neon branches.
2. Obtain a pooled and direct URL from each branch's Connect dialog using its environment-specific database role. Require TLS (`sslmode=require` or `verify-full`). Development/staging endpoints must differ from the production host fingerprint in `config/production-resources.json`.
3. Provision private development and staging storage buckets/endpoints with separately scoped credentials. The policy deliberately rejects the current production storage endpoint and known production credentials; choose separate branch endpoints. Disable public reads; allow only the matching application origin in CORS. Existing services authorize file ownership in the database before signing object access. Verify cross-user reads/deletes are denied using synthetic files/accounts.
4. Use separate nonproduction Redis instances/credentials. Start with the smallest practical service tier. Set `CACHE_NAMESPACE=development` locally and `preview` for staging (the existing cache schema calls staging `preview`; this is not a fourth environment). Production stays `production`.
5. Create separate OpenAI project keys for development and staging; set low provider budgets/alerts, monitor usage, and set low Aven application budgets (`AVEN_DAILY_BUDGET_USD`, `AVEN_MONTHLY_BUDGET_USD`, `AVEN_GLOBAL_MONTHLY_BUDGET_USD`). Provider alerts are not assumed to be hard spending stops: the application's budget checks are also required. Keep keys out of `NEXT_PUBLIC_*`, logs, and client code. Do not copy the production key. Leave email/push credentials empty unless testing with a controlled recipient sink. `NONPRODUCTION_JOBS_ENABLED=false` disables cron/background invocation by default; enable only for intentional QA with test accounts and isolated resources.
6. Payments remain unconfigured. Any future provider adapter must explicitly select sandbox mode outside production, use sandbox webhook/checkout credentials, and test signature validation. Never put live payment credentials in development/staging. Keep production billing behavior unchanged during this rollout.

Use scale-to-zero Neon compute where available, local Next.js development, one persistent Vercel Preview for staging, existing production hosting, GitHub Actions, and no feature deployment environments. Review current provider quotas before provisioning; this guide makes no paid-plan purchase.

## Environment variable handling

`.env.example` contains **names with empty values**, not credentials or invented database URLs. All `.env*` files except that example are gitignored. Do not overwrite `.env.local` or `.env.production`. Create `.env.development.local` and `.env.staging.local` privately; production values belong in Vercel's secure **Production** scope.

| Variables | Development | Staging | Production |
| --- | --- | --- | --- |
| `APP_ENV` | `development` | `staging` | `production` (existing Vercel production inferred if absent) |
| `ENVIRONMENT_ISOLATED` | `true` only after isolation | `true` only after isolation | Not required |
| `APP_URL` | `http://localhost:3000` | Stable staging HTTPS origin | `https://acadence.janidudev.com` |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Development Neon URLs | Staging Neon URLs | Existing production URLs |
| `AUTH_SECRET`, `CRON_SECRET` | New independent secrets, >=32 chars | Different independent secrets | Existing secrets |
| `OBJECT_STORAGE_*` | Private development storage | Private staging storage | Existing production storage |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Isolated development Redis | Isolated staging Redis; required in hosted production-mode Next.js | Existing Redis |
| `CACHE_NAMESPACE` | `development` | `preview` | `production` |
| `OPENAI_API_KEY`, `OPENAI_*MODEL`, pricing/reasoning variables | Separate test project; use actual supported model/prices | Separate QA project | Existing production configuration |
| `AVEN_*BUDGET_USD`, `AVEN_*TOKEN_LIMIT`, `AVEN_MAX_OUTPUT_TOKENS` | Small test limits | Small QA limits | Approved production limits |
| `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_*` | Empty or controlled test delivery | Empty or controlled test delivery | Production credentials |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Separate optional OAuth client | Separate optional OAuth client | Optional production client |
| `NONPRODUCTION_JOBS_ENABLED` | `false` | `false` | Existing cron behavior preserved |
| `BILLING_ENFORCEMENT` | `off`, or `on` for entitlement tests | `on` during subscription QA | Existing setting |
| `TEST_DATABASE_*`, `SEED_USER_*`, Playwright flags | Only synthetic isolated fixtures | Only intentional isolated QA | Never import |
| `NEXT_DEPLOYMENT_ID` | Only if self-hosted | Vercel manages identity | Vercel manages identity |
| `CONTACT_EMAIL` | Optional public contact | Optional test contact | Approved public contact |

The launcher neutralizes all listed variables before selecting a private file, so Next.js cannot fill missing settings from the legacy `.env.local`. Runtime guards reject known production endpoint/key fingerprints in nonproduction before opening database/storage/AI clients. Fingerprints contain no secret values; refresh them during a planned production credential rotation. They detect known resources, not every possible hostname alias or compromised credential; independent provider access controls remain necessary. Do not spoof `APP_ENV=production` locally to bypass isolation.

```powershell
npm run check:environment -- development
npm run dev
npm run check:environment -- staging
```

A local production file used with the checker must declare `APP_ENV=production`; create a separate private reviewed file if the preserved legacy file does not. The old `check:production` checker remains available, but it is not an isolation check. Do not run legacy fixture/load-audit scripts until their target resources have been reviewed.

## Vercel configuration — required before enabling staging

1. Open the project serving the production domain. In **Settings > Environments > Production**, verify the Git branch is `main`. Keep Node 24.x, `npm ci`, `npm run build`, and the existing domain/cron schedules. Do not change them merely because another project is named acadence.
2. Audit **Settings > Environment Variables** on all three connected projects. Production credentials must target **Production only**, never Preview/Development/All Environments. Remove unintended Preview exposure after verifying the production scope remains populated. Never export those values to logs or PR artifacts.
3. On the canonical project, add isolated staging variables to **Preview**, with a branch override for **staging**. Set `APP_ENV=staging`, `ENVIRONMENT_ISOLATED=true`, `CACHE_NAMESPACE=preview`, the fixed staging `APP_URL`, and `NONPRODUCTION_JOBS_ENABLED=false`. Configure the stable branch Preview domain and optional access protection; do not create a paid custom environment or a second hosting project solely for staging. Configure auth OAuth redirects/CORS for this origin.
4. To keep duplicate projects from deploying staging, set their **Settings > Git > Ignored Build Step** to `if [ "$VERCEL_GIT_COMMIT_REF" = "main" ]; then exit 1; else exit 0; fi` after checking their actual purposes. In the canonical project use `if [ "$VERCEL_GIT_COMMIT_REF" = "main" ] || [ "$VERCEL_GIT_COMMIT_REF" = "staging" ]; then exit 1; else exit 0; fi`. Exit 0 skips; exit 1 builds. Ignore rules save builds but are not a substitute for secret isolation.
5. Only after scopes, URLs, and service isolation are verified, change `git.deploymentEnabled.staging` from `false` to `true` in `vercel.json` through a feature PR and staging promotion. The bootstrap deliberately leaves staging off; `main` remains true and all other branches false. This prevents publishing the new branches from starting unsafe previews. Verify actual provider behavior and no unwanted deployments after the first push.
6. Require GitHub `required-ci` and PRs before main/staging merges. Existing Vercel Git deployment is independent of Actions; where supported configure provider deployment checks/approval for the same SHA. A solo developer's reviewed main merge is the release approval. No GitHub Environment approval is claimed to control Vercel's external Git integration. Serialize releases operationally: freeze staging during QA and wait for production verification before another merge. Confirm provider queue/cancellation behavior; workflow concurrency controls CI only.

Vercel [Git deployment controls](https://vercel.com/docs/project-configuration/git-configuration), [environment variables](https://vercel.com/docs/environment-variables), and [ignored builds](https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel). Vercel's default allows unspecified branches; the explicit `**: false` allowlist is necessary.

## Database migrations and recovery

```powershell
npm run db:generate
npm run db:migrate
node scripts/run-environment.mjs staging migrate
```

The first command generates SQL/metadata offline; the others select only the requested isolated env file. Review destructive SQL, large table locks, constraints and defaults. Use expand/contract releases: add compatible schema first, ship code using it, backfill deliberately, then remove old columns in a later explicitly approved release. Never use `drizzle-kit push` as an unreviewed production shortcut.

Production steps: confirm the tested release SHA, SQL hashes/journal, production connection identity, a working restore window/backup, and recovery owner; stop concurrent release/migration execution; obtain explicit approval for the actual SQL. On a clean checkout of that approved main release, use a private file with `APP_ENV=production` and the production connection pair:

```powershell
node scripts/run-environment.mjs production check --env=.env.release.local
node scripts/run-environment.mjs production migrate --env=.env.release.local --approved-production-migration
```

The explicit flag prevents routine execution; it is not permission to approve your own destructive migration. Drizzle's tracked migration ledger prevents ordinary repeat application; there is no distributed migration lock in this repository, so run exactly one operator/job at a time. Ordinary CI validates migration metadata, not production schema. CI integration migrations run only on a disposable nonproduction database during explicitly requested trusted dispatches.

Verify migration ledger/state and the app after execution. Application rollback must not undo database migrations automatically. Prefer a forward repair. For a required restore, confirm Neon restore history and recovery point, recover into an isolated recovery resource, validate it privately, plan data-loss/cutover consequences, and approve the connection cutover. Recovery resources are temporary incident tooling, not a fourth permanent environment. Do not reset/overwrite the production branch during diagnosis. No backup retention or restore drill was verified in this setup.
