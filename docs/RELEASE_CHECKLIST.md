# Acadence release checklist

Copy this into the production PR. Keep staging frozen between QA and main merge.

- [ ] Release scope reviewed; no unfinished/unrelated features included.
- [ ] `required-ci` green: lint, typecheck, unit/analytics tests, migration metadata, production build, public browser checks, credential scan, high/critical dependency audit.
- [ ] Skipped integration tests explicitly reviewed; trusted isolated integration dispatch completed where configured.
- [ ] Staging commit SHA: __________; Vercel deployment ID: __________.
- [ ] Staging uses its own Neon endpoint, storage, signing secrets, Redis, OpenAI key; payment provider absent or sandbox-only.
- [ ] Synthetic accounts only; no production data copied; email/push/scheduled jobs disabled or controlled.
- [ ] Migration SQL reviewed, development/staging application verified; production recovery/approval recorded if needed.
- [ ] Login/logout, dashboard, learner ownership, upload/download, and subscription access verified on staging.
- [ ] Billing enforcement tested with synthetic Free/paid accounts; signed webhook tests required once a provider exists.
- [ ] Aven configuration available; budget limits checked without an expensive model request.
- [ ] `staging -> main` merge tree equals the tested staging tree; staging SHA has not changed after QA.
- [ ] Production hosting variables scoped only to Production; canonical project/branch `main` confirmed.
- [ ] One release/migration in progress; rollback deployment and schema compatibility recorded.
- [ ] Main merge approved by maintainer; actual successful production SHA and deployment ID recorded.
- [ ] Production read-only smoke check: `node scripts/smoke-release.mjs https://acadence.janidudev.com`.
- [ ] Manually log in with an owned account; dashboard/session/logout work; no synthetic production signup or test payments.
- [ ] `/api/health` succeeds (database and account configuration), anonymous `/api/auth/get-session` responds, unauthenticated `/dashboard` redirects to login.
- [ ] With the owned account, verify Aven status/configuration and subscription access enforcement; do not issue a paid AI generation merely as a smoke test.
- [ ] Tag the actual deployed main SHA using the next unused version; synchronize hotfixes into staging/develop.

Smoke automation is read-only. It cannot prove authenticated login, paid entitlements, AI key validity, file ownership, or staging database isolation by itself. Do not claim those checks passed without the matching evidence.
