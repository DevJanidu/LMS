# Workflow setup status — 2026-10-13

## Implemented and verified

- Production baseline: main `f4fd7adb554d33b174a1aceab2974cebdb54f717`. Owner confirmation and successful GitHub Vercel records match this SHA; live HTML reports a deployment ID associated with this SHA. Existing annotated `v2.4.0` preserved and published; no tag overwritten.
- Local `develop`/`staging` already existed at the baseline; remote branches were absent. Both were advanced by one nonproduction deployment-gating commit (`6401419`) and published with upstream tracking. That commit changes only `vercel.json`, leaving main application code and cron schedules identical. `main` remains unchanged and the default branch. Legacy branches retained.
- GitHub confirmed classic protection for `main`, `staging`, `develop`: PR required, `required-ci` from GitHub Actions (app 15368), strict/up-to-date status checks, administrators enforced, conversation resolution required, zero second-party approvals, no force push and no branch deletion.
- The full setup is on `feature/environment-workflow` in an isolated worktree, preserving the original dirty main checkout and the older unfinished `feature/devops-workflow` worktree. No production migration, seed, storage mutation, model generation or hosting change was executed.
- Repository gate: main deployments enabled; staging and all other branches disabled until isolated hosting is configured. GitHub reported no new deployments after branch publication.

## Rollout dependencies

1. Merge the setup PR into develop only after `required-ci` passes. The bootstrap branches still contain the older CI workflow; the new checks become active through this PR. Main hotfixes using the old workflow will lack `required-ci` until this setup reaches main; include the reviewed workflow update in an urgent hotfix rather than bypassing protection.
2. Provision development/staging Neon and storage with no customer data. Existing `.env.local` shares production database, storage, signing, OpenAI and Redis credentials. It remains untouched and is unsafe for nonproduction. The setup's guarded launcher rejects those identities and selects `.env.development.local` instead.
3. Follow [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) to scope Vercel production secrets, configure staging Preview overrides, confirm the canonical project/domain association, restrict duplicate projects, and enable staging only after isolation passes. No Vercel/Neon management credentials were available.
4. Configure optional manual integration credentials only for a dedicated isolated test project/empty parent and nonproduction Redis. These database fixtures are temporary; no fourth permanent application environment is created. Until supplied, database/authenticated tests are explicitly skipped in ordinary checks.
5. QA the exact staging SHA, then PR staging into main. Do not deploy this setup straight to main to skip staging. No new production release has been performed.

## Environment status

| Environment | Application | Data/service isolation |
| --- | --- | --- |
| Development | Local only; guarded launcher implemented | New private env file and isolated providers required; legacy shared credentials rejected |
| Staging/QA | Branch exists; hosted deployment disabled | Provisioning, scopes, CORS/auth origins and sandbox QA pending |
| Production | Existing live app preserved; read-only public checks passed | Existing production services preserved; backups, account-specific smoke checks and hosting scope audit still required |

Vercel currently reports multiple existing Preview/Production GitHub deployment labels. They were not deleted or treated as newly provisioned application environments. Consolidation requires a project/domain audit; this implementation creates no new hosting project.

## Validation evidence

Setup PR: [#2](https://github.com/DevJanidu/LMS/pull/2), feature/environment-workflow into develop. Its GitHub Actions runs provide remote runner evidence; merge only after the current required check succeeds.

Clean-worktree local validation used Node 24, the existing npm lockfile and the workflow's non-live fixtures, with no copied env secrets:

- `npm ci`, ESLint, generated route types and TypeScript: passed.
- Vitest: **397 passed, 53 explicitly gated tests skipped** across 61 files; infrastructure/audit coverage was not claimed.
- Node analytics/schedule checks: **13 passed**; English message-reference validation passed.
- Drizzle migration metadata and workflow YAML/branch trigger validation: passed; no live migration applied.
- Production Next.js build: passed (56 static route entries).
- Public Playwright against that production build: **6 passed, 3 authenticated/infrastructure scenarios skipped**. The installed Chromium runner was used; no production server was used for these browser fixtures.
- Runtime dependency audit: **0 vulnerabilities**; tracked credential-pattern scan: passed. No dependency versions were changed.
- The legacy shared local credentials were explicitly rejected by the new isolation policy before any connection. Separate provisioning and staging deployment still require verification.
- Read-only live smoke checks: `/`, `/login`, `/api/health`, `/api/auth/get-session` passed, and `/dashboard` redirected to login. Authenticated customer workflows, provider scope settings and backup recovery were not asserted.

The implementation worktree is clean after commits; the original checkout retains the user's pre-existing authentication/UI edits and the older draft worktree remains untouched.

## GitHub UI equivalent

Rules are already API-confirmed. To inspect/recreate: repository **Settings > Branches > Add branch protection rule**, exact pattern `main`, then repeat `staging` and `develop`. Enable **Require a pull request before merging** with required approvals off/0; **Require status checks** with `required-ci` from GitHub Actions and **Require branches to be up to date**; **Require conversation resolution**; **Do not allow bypassing the above settings**. Leave **Allow force pushes** and **Allow deletions** off. Do not enable linear history for this merge-commit promotion workflow. Keep Settings > General default branch as `main`.

See [GitHub protection API](https://docs.github.com/en/rest/branches/branch-protection) for the confirmed rule fields. Vercel's external Git integration does not use GitHub Environment approvals, so none is claimed to govern production deployment.
