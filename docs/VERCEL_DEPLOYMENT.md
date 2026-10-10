# Vercel production configuration

Audited on 10 October 2026. The production domain is https://acadence.janidudev.com. Database, storage, Redis, auth and cron credentials are reused from `.env.local` at the owner's request. `.env.production` is the private, gitignored import file. Never commit its contents.

## Environment inventory

| Variables | Production configuration |
| --- | --- |
| `APP_URL` | `https://acadence.janidudev.com` (origin without trailing slash) |
| `DATABASE_URL` | Existing pooled Neon connection, TLS enabled |
| `DATABASE_URL_UNPOOLED` | Existing direct connection to the same Neon database, TLS enabled |
| `AUTH_SECRET`, `CRON_SECRET` | Existing 64-character secrets |
| `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION` | Existing Neon storage branch; region `us-east-2` |
| `OBJECT_STORAGE_BUCKET` | Existing `uploads` bucket |
| `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Existing S3 credentials |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Existing Upstash REST credentials |
| `CACHE_NAMESPACE` | `production` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend key provided by the owner; sender `Acadence <hello@acadence.janidudev.com>` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Empty; optional Google sign-in is disabled |

No `NEXT_PUBLIC_*` variables are needed. Do not import `SEED_USER_*`, test/audit flags or `AWS_*` aliases; the app reads explicit `OBJECT_STORAGE_*` credentials. Let Vercel manage `NODE_ENV` and its system variables. Use `CACHE_NAMESPACE=preview` for previews and the preview deployment's HTTPS origin for `APP_URL`.

## Vercel settings

1. Select the Next.js framework preset, the repository root, Node.js **24.x**, install command `npm ci`, build command `npm run build`, and the default output directory. `package.json` pins the supported Node major to 24.
2. Import `.env.production` into **Settings > Environment Variables**, scoped to **Production**. Mark sensitive credentials as sensitive. Set these values before building; the storage endpoint is used to construct the Content Security Policy at build time. Redeploy after changing variables.
3. Add `acadence.janidudev.com` under **Domains**, apply the DNS records Vercel provides, and verify HTTPS. This is the canonical origin used for authentication, origin checks and account email links.
4. Use **Pro or Enterprise** for the current `vercel.json`: reminders run every 15 minutes and timers hourly. Hobby rejects schedules running more than once per day. Keep `CRON_SECRET` configured so Vercel's cron requests authenticate.
5. Set the production Git branch and confirm the environment variables belong to that project. No connected Vercel project or account was available during this audit, so remote settings and DNS have not been verified.

Vercel reads dashboard environment variables for Git deployments; the gitignored local file is an import artifact. See [Vercel environment variables](https://vercel.com/docs/environment-variables), [Node runtimes](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), and [cron scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Repeatable checks

```powershell
npm run check:production -- --connections
npm run build:production
```

The production checker reads only `.env.production`, validates required variables and checks database connectivity, migration hashes, Redis PING, storage access, production CORS and anonymous HEAD denial on an existing object. It does not modify database rows, send emails, upload files or execute cron jobs. SQL hashes accept LF and CRLF checkouts and require the migration journal timestamp to match.

`build:production` injects the exact file values into the build process. A plain local `npm run build` loads `.env.local` before `.env.production`, so it does not prove the production configuration was used. On Vercel the configured process environment takes priority over files. See the installed Next.js guide at `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`.

`node scripts/configure-production-cors.mjs` adds the production origin to bucket CORS, preserves existing rules, and verifies a browser PUT preflight including content-type and checksum headers. It does not change bucket privacy or upload/delete objects.

## Release evidence and remaining verification

The audit verified pooled/direct database connectivity, all six committed migrations, Redis connectivity, bucket access and anonymous-read denial on one existing object. No migration or seed was run. Local lint, TypeScript and the unit suite passed (211 tests; 12 integration tests skipped). A standard production build also passed; the exact production-file build and CORS check are recorded in `docs/PRODUCTION_ENV_AUDIT.md`.

Email setup and registration greetings are documented in [EMAIL_SETUP.md](EMAIL_SETUP.md). A sender alone is allowed while setup is pending; actual welcome, password-reset and verification delivery requires the Resend key and verified domain. Verify delivery without printing reset links or tokens. Google OAuth is optional; if enabled later, configure the redirect URI `https://acadence.janidudev.com/api/auth/callback/google` in Google and test sign-in.

After deployment, verify `/api/health`, login/logout, dashboard access, a signed upload/download, and scheduled job logs. Confirm backup retention and a recovery drill. The earlier readiness report's skipped database/browser coverage still needs release validation; successful environment checks do not prove all user workflows.

Because the owner chose to reuse services, development and production now share the same database and storage. Local seeds and destructive test fixtures affect those services; preview credentials should be configured deliberately before enabling preview deployments.
