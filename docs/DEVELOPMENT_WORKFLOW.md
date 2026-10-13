# Acadence development workflow

Exactly three application environments: local **development**, hosted **staging/QA**, and existing **production**. Normal promotion is `develop -> staging -> main`. Temporary Git branches and short-lived CI database fixtures are not additional application environments.

| Branch | Purpose | Application / services |
| --- | --- | --- |
| `develop` | Integration; feature starting point | Local Next.js; isolated development Neon and storage |
| `staging` | Release candidates and final QA | One persistent Vercel Preview; isolated staging Neon/storage; sandbox payments |
| `main` | Approved production releases | Existing production deployment and services |

`main` stays GitHub's default/production branch. Existing `dev`, `dashboard`, `goals`, and other branches are preserved; they are not environment branches. Do not use `dev` as a substitute for `develop`.

## Initial setup

Read [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) before starting servers or database tools. Existing `.env.local` shares production credentials and must not be used for development. It has been preserved, not rewritten. Create `.env.development.local` from `.env.example` and populate only newly provisioned development credentials.

```powershell
git fetch origin
git switch develop
git pull --ff-only origin develop
git switch -c feature/aven-ai-credits
npm ci
npm run check:environment -- development
npm run dev
```

Use `feature/short-description` for features, `fix/short-description` for routine bugs, and `hotfix/short-description` for urgent production fixes. Do not switch a dirty working tree: finish the work on its current branch or use a separate worktree. Never force-push or reset someone else's work.

## Feature PR and integration

Run `npm run lint`, `npm run typecheck`, and `npm test`. A production build is validated in CI with non-live fixtures. If building locally, use a clean worktree without production env files and isolated configuration; plain Next.js builds prefer `.env.local` over `.env.production`.

```powershell
git add <only-your-files>
git commit -m "feat: implement Aven credit controls"
git push -u origin feature/aven-ai-credits
```

Open `feature/aven-ai-credits -> develop`; describe behavior, tests, and migration changes. Require `required-ci`. There is no hosted feature deployment. A solo maintainer can review the diff and merge their own PR; a second reviewer is not required. CI infrastructure secrets never go to PR code.

## Release to staging

Open `develop -> staging` only when all intended changes are complete. Review `git diff origin/staging...origin/develop` and the PR Files changed tab. Wait for CI, merge, and record the resulting staging SHA. Deployments remain disabled until the hosting isolation checklist is completed.

Run staging QA from [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md); record the exact SHA and deployment ID in the production PR. Do not merge additional staging changes during QA/production promotion. If staging changes, repeat QA. Apply reviewed migrations to staging separately before testing dependent code.

For a selective release, create a temporary `release/short-description` from the last tagged production commit, cherry-pick only reviewed commits, and PR it into staging. This creates no new environment. If staging already contains excluded work, do not revert/reset it blindly: complete its current release or inspect a temporary reconciliation branch that removes the excluded code through a reviewed PR. Later synchronization must preserve completed work.

## Release to production

Open `staging -> main`. `release-policy` rejects a PR merge tree different from its staging source tree. `required-ci` validates the merge candidate. Verify the staging SHA/deployment in the checklist, approve the release by merging the PR, and wait for Vercel. Use merge commits for long-lived branch promotions; avoid squash/rebase promotions that lose ancestry.

The existing Git integration rebuilds for each target environment. Storage CSP and deployment identity are build-specific, so a staging Preview artifact must not be blindly promoted with staging credentials. Require identical source trees, validate the production configuration, and smoke-test the production build. Keep one production release in progress at a time; do not merge the next release until the current deployment is verified.

After successful production smoke tests, tag the **actual deployed main SHA**, never merely the newest local commit:

```powershell
git fetch origin --tags
git show --no-patch <verified-production-sha>
git tag -a v2.4.1 <verified-production-sha> -m "Acadence verified production release"
git push origin v2.4.1
```

`v2.4.0` is the verified baseline at `f4fd7adb554d33b174a1aceab2974cebdb54f717`. Do not overwrite any existing tag. Pick the next version according to release impact. Synchronize `main -> staging`, then `staging -> develop` through PRs after release/hotfix changes; never overwrite the integration branches.

## Hotfix

```powershell
git fetch origin
git switch -c hotfix/login-session-error origin/main
```

Fix only the urgent issue, run checks, and PR `hotfix/login-session-error -> main`. The normal release-policy exception permits this source. Use an isolated local database to test; do not test writes on production. After approving and verifying production, tag its deployed SHA. Create a temporary branch from staging, merge `origin/main`, resolve conflicts without dropping either branch's work, and PR it into staging. Then synchronize staging into develop through a PR. Source branches for reconciliation may use `hotfix/*`; their PRs must explain the synchronization. If a queued release's tree changed because of the hotfix, repeat staging QA before its promotion.

## Database and rollback

Generate tracked migrations with `npm run db:generate`; review both SQL and Drizzle journal metadata. Test on development, then staging. Production migration execution is a separately approved release operation described in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md). Ordinary PR checks never migrate production.

For application incidents, use Vercel's previous verified production deployment, then create a reviewed Git revert PR to reconcile `main`. Revert the faulty release with `git revert -m 1 <merge-commit>` on a temporary `hotfix/*` branch, inspect the diff, and PR to main. Check schema compatibility before deploying old code. Database rollback is never automatic; use a reviewed forward repair or a planned restore with recovery/cutover validation.

## Useful inspection commands

```powershell
git status --short
git branch -vv
git log --oneline --graph --decorate -15
git diff origin/main..origin/staging
git diff origin/main^{tree} origin/staging^{tree}
git worktree list
```

CI details: [CI_SETUP.md](CI_SETUP.md). Current rollout evidence and remaining setup: [WORKFLOW_SETUP_STATUS.md](WORKFLOW_SETUP_STATUS.md).
