# Backend checks: diagnosis and configuration

> The historical CI repair below is superseded for workflow behavior by this section. The workflow now runs PRs and pushes for `develop`, `staging`, and `main`. Required check: **`required-ci`**. It aggregates release source/tree policy, secret-pattern scan, high/critical runtime dependency audit, lint, typecheck, analytics/unit tests, Drizzle metadata, production build and public Playwright checks. Node 24, locked npm dependencies, caching, pinned actions, read-only token permissions and short-lived diagnostic artifacts are retained. The current runtime dependency audit reports zero findings; future high/critical findings block merges. No dependency versions were changed by this setup.
>
> Pull requests receive non-live configuration only, including same-repository PRs. Database integration is now **manual dispatch only**, with input `integration=true` on trusted `develop` or `staging`. Configure the five Neon/Redis settings listed below using an isolated nonproduction project and empty parent. Ordinary PRs do not create database branches or run migrations. An explicitly requested integration dispatch fails if these settings are missing, creates a schema-only disposable child, migrates it, runs database/authenticated browser checks, and cleans it up with an expiry fallback. Test-only mocked fixtures are not another permanent environment. The integration parent must be empty, not a schema clone that already contains the app tables without Drizzle's migration ledger.
>
> CI does not deploy the app. Vercel's existing external Git integration remains separate; branch protection controls merges. Staging is deliberately disabled in `vercel.json` until [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) is completed. The main required check will remain pending for hotfix branches using the old workflow until the setup is promoted through staging into main; base hotfixes on the installed workflow or include its reviewed CI update. Do not bypass protections to hide this bootstrap dependency.

Audited 11 October 2026 against `main` at `6b24d91`.

## Architecture discovered

One root npm project serves both frontend and backend: Next.js 16 App Router,
React 19, strict TypeScript, Tailwind v4 and next-intl. Route handlers and Server
Actions call scoped services through Drizzle and the Neon serverless Postgres
driver. Better Auth uses Argon2id; optional email uses Resend; uploads use private
S3-compatible Neon storage. Upstash Redis supplies production rate limiting and
optional caching. Node is constrained to `24.x` in `package.json`; the committed
npm lockfile is version 3. Vitest covers unit/service behavior, Node's test runner
covers pure analytics/schedule fixtures, and Playwright covers public and
authenticated browser flows. Drizzle migrations are committed in `drizzle/`.

Vercel is the documented deployment target; `vercel.json` defines cron jobs.
There is no existing GitHub deployment workflow or deployment token. The GitHub
repository has a `Production` environment but no repository-level Actions
variables or secrets at audit time. Environment-scoped secrets were not read.

## All four failed runs

| Run | Commit | Exact failing step |
| --- | --- | --- |
| [38056284864](https://github.com/DevJanidu/LMS/actions/runs/38056284864) | `6b24d91` | `npm run typecheck` |
| [38053111959](https://github.com/DevJanidu/LMS/actions/runs/38053111959) | `400f14a` | `npm run typecheck` |
| [38045029179](https://github.com/DevJanidu/LMS/actions/runs/38045029179) | `554d44f` | `npm run typecheck` |
| [37755265438](https://github.com/DevJanidu/LMS/actions/runs/37755265438) | `58aacc9` | `npm run typecheck` |

GitHub job steps, annotations and downloaded logs confirm that checkout, Node
setup, `npm ci`, and ESLint passed in every run. TypeScript reported `TS2322`
when `className` or accessibility props were passed to imported SVG icons.
Later test/build/browser steps never ran. The optional database job was skipped.

`src/svg.d.ts` declared default SVG exports as strings and declared a named
React component export that the app never imports. Both configured SVGR loaders
actually provide default React components. Fresh checkouts therefore rejected
the component props (34 errors in the latest run). Local builds appeared healthy
because generated, gitignored `next-env.d.ts` loads Next's permissive SVG `any`
declaration. The same failures were reproduced from an unmodified clean archive
of `6b24d91`, installed with `npm ci`, with no generated types or environment files.

The fixed declaration describes the actual default component, and tsconfig loads
it before Next's generated declarations, following [SVGR's Next.js guidance](https://react-svgr.com/docs/next/).
`npm run typecheck` now runs `next typegen` before `tsc --noEmit`, generating route
types on fresh checkouts while retaining strict checking.

Two further defects were previously unreachable:

* `npm test` rejected `welcomeSubject` despite its presence in all four message
  dictionaries. Its AST scanner assumed every `t()` used the root `studyflow`
  namespace. The scanner now follows lexical translator bindings, literal/object
  namespace arguments, aliases and conditional literal keys. Regression tests
  ensure nested keys are checked and unrelated/shadowed bindings are excluded.
* The public production server lacked the required environment, and the optional
  authenticated job lacked Redis. Startup validates database, signing, storage,
  origin and Redis configuration; production authentication deliberately fails
  closed without working Redis. Those production protections remain enabled.

## Workflow behavior

`.github/workflows/backend.yml` keeps the existing workflow/job names. It runs on
pushes to `main`, PRs targeting `main`, and manual dispatches. It uses Ubuntu
24.04 explicitly, Node from `package.json`, lockfile-based npm caching and `npm ci`.
Actions are pinned to verified commits of checkout/setup-node/upload-artifact v6
and the existing Neon create v6/delete v3 actions. Permissions remain `contents: read`;
checkout credentials are not persisted. Job timeouts bound failures; newer PR
runs cancel older runs while pushes are not cancelled.

The required `quality` job runs ESLint, generated-route/TypeScript checks,
translation parity/reference checks, analytics/schedule tests, Vitest, migration
metadata validation, a production build, and Playwright public route/mobile
checks. Formatting has no existing required script/baseline, so the workflow
keeps ESLint rather than introducing a repository-wide formatting gate.

Public checks use explicit **non-live fixtures**, never production credentials.
They exercise public pages and unauthenticated redirects without accessing a
database or Redis. Email and Google OAuth are disabled. All required production
configuration fields are present, and production environment validation is
unchanged. Database-dependent browser/unit tests remain explicitly skipped in
this job; those skips are visible in test reports.

Playwright starts the already-built application using `PLAYWRIGHT_SKIP_BUILD=1`;
its normal local default still builds before starting. CI disallows `test.only`,
uses one worker, and captures HTML reports, failure screenshots and traces.
Artifacts contain only browser diagnostics and have limited retention; no
environment files, deployment credentials or full build directory are uploaded.

## Enable isolated database coverage

The `database` job runs after `quality` on pushes/manual dispatches and internal
PRs when both Neon variables below are configured. Fork PRs get only the public
job and never receive service credentials. Set these under repository
**Settings > Secrets and variables > Actions** (not only the Production environment):

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `NEON_PROJECT_ID` | A dedicated test Neon project |
| Variable | `NEON_TEST_PARENT_BRANCH` | An empty test parent branch name/ID |
| Secret | `NEON_API_KEY` | A key authorized to create/delete branches in that project |
| Variable | `CI_UPSTASH_REDIS_REST_URL` | Dedicated test Redis REST endpoint |
| Secret | `CI_UPSTASH_REDIS_REST_TOKEN` | Its REST token |

The parent must be genuinely empty: no application tables/types or existing
Drizzle migrations. Each run creates a uniquely named **schema-only** child,
applies all committed migrations, then runs ownership/service integration tests
and authenticated registration/onboarding/learner browser flows. It does not run
the application seeder or send real emails. Real email delivery and signed file
upload/storage checks require separate isolated service configuration and are
not claimed by this workflow. Existing current-database calendar/performance
audit tests require their separate fixture flags and stay disabled in CI.

Redis is required before creating a branch; missing enabled-job credentials
produce an explicit failure. The cache namespace is `test`, and keys are scoped
to each generated database branch. Branch cleanup runs with `always()`; branches
also expire after one day if the runner is terminated before cleanup. The Neon
driver uses HTTP/WebSockets, so substituting a plain Postgres service container
would not reproduce this application's actual database transport.

Never reuse the gitignored local development/production database for this job.
The current deployment notes say those environments share services. The audited
475 tracked files contained no matches for 12 known local credential values;
tracked environment-file history contains only `.env.example`. This targeted
review does not prove that no historical unknown credential has ever leaked.

## Deployment and required checks

This change repairs CI without initiating a production deployment, changing
production credentials or applying production migrations. Vercel's existing Git
integration remains the deployment mechanism; consult [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).
Use the `quality` check in the main branch ruleset. If Vercel deployments must
wait for CI, configure the linked Vercel project's deployment checks; a Git
deployment is otherwise independent of this workflow. Production migrations
remain a separately authorized release operation. No unconfigured deployment
step is added to make CI appear to deploy successfully.

## Validation

The clean checkout reproduced the original SVG errors; patched local checks
passed lint, generated-route TypeScript checks, 13 analytics/schedule tests and
223 Vitest tests (12 explicitly gated infrastructure/audit tests skipped).
Migration metadata and workflow YAML syntax passed. The clean production build
generated all 120 static pages successfully using only the workflow fixtures.
Public Playwright checks passed against that production server (1 passed;
2 authenticated tests explicitly skipped). These checks used Node 24 on Windows;
the PR's GitHub run verifies the pinned Ubuntu runner and Chromium installation.
Live Neon integration cannot be asserted until the five repository-level CI
settings above are supplied.

The clean `npm ci` also reported five existing high-severity dependency audit
findings. Dependency upgrades are not included in this CI repair; assess them
separately rather than applying `npm audit fix --force` and changing application
dependencies without compatibility validation.
