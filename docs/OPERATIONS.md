# Operations

## Environments and migration

The supplied connection was verified on 7 October 2026 (PostgreSQL 18.6). All five committed migrations were applied and the requested Super Admin was seeded without demo subjects or sessions. The existing private `uploads` bucket was verified with signed PUT/GET, HEAD, COPY, anonymous-read denial, tampered-signature rejection, local-origin CORS and cleanup. Credentials are stored only in gitignored `.env.local`; both OBJECT_STORAGE_* and AWS_* aliases are populated.

Email setup was explicitly left pending. RESEND_API_KEY and EMAIL_FROM remain absent, so the application's strict configuration validation still prevents authenticated app startup/requests until these are provided. Production also requires Upstash Redis credentials. The independent connection/storage checks do not require email configuration.

Create independent development and production Neon branches. Use a sanitized, disposable test parent for CI; never put production learner content in PR previews. Each deployment must pair its database branch and storage branch. Migrations run via `npm run db:migrate` before deployment, not during app startup. Try migrations on a restored branch first.

`DATABASE_URL` is the pooled app connection. `DATABASE_URL_UNPOOLED` is the direct migration/seed connection. The backend runs in the Next.js Node runtime. Node 24 is the tested runtime and includes the WebSocket implementation used by the Neon transaction driver.

## Private storage

Use Neon Console -> Object storage -> New bucket -> **private**. Copy the actual branch endpoint, region and credentials from Connect -> Storage, mapping the displayed S3 parameters to `OBJECT_STORAGE_*`. Do not construct the endpoint or use the API token as an S3 secret. Neon requires `forcePathStyle: true`.

Configure bucket CORS with `PutBucketCors`, allowing only your actual APP_URL origin, methods PUT/GET/HEAD, and the Content-Type and signing/checksum headers used by the AWS client. Expose ETag if needed. Add preview origins deliberately. Do not make the bucket publicly readable. Neon supports CORS configuration through the S3 API; bucket ACL/policy mutation through S3 is unsupported, so use the Console to choose private access.

Primary references checked during implementation: [authentication](https://neon.com/docs/storage/authentication), [bucket access](https://neon.com/docs/storage/buckets), [S3 compatibility and CORS](https://neon.com/docs/storage/s3-compatibility). Credentials are branch-scoped and valid on descendants. Storage lifecycle rules are not enforced by Neon; run the application cleanup job.

## Cron

| Route | Frequency | Behavior |
| --- | --- | --- |
| `/api/cron/reminders` | 15 minutes | Upcoming blocks and local today/tomorrow deadlines; unique reminder keys |
| `/api/cron/timers` | Hourly | Pause overdue timers at the confirmation checkpoint |
| `/api/cron/storage` | Daily | Expire unconfirmed uploads after 24h and retry up to 100 queued deletions |
| `/api/cron/retention` | Daily | Expired auth tokens/sessions and notifications over 90 days |

Vercel injects `Authorization: Bearer CRON_SECRET`; all job routes reject other requests. Use a hosting plan supporting the declared schedule. Monitor health plus job response counts. A growing deletion queue needs investigation without logging object contents or signed links. Deletes are deferred for at least an hour to avoid racing an in-flight upload confirmation.

## Backups and recovery

Use Neon's restore window/point-in-time restore according to the selected plan. Practice a restore to a new branch, run migrations there and verify account, timer and file metadata consistency before changing traffic. Storage is branch-aware; verify that the restored database and storage views match. Document the actual retention window and recovery targets for your plan. A restore drill has not been executed here.

## Secrets

Rotate AUTH_SECRET deliberately: existing sessions may become invalid. Rotate storage credentials in Neon, update the app environment, verify downloads and revoke the previous credential. Rotate Resend, Redis and cron secrets through their providers and Vercel. Never log or paste connection strings into build output. Use independent values in preview and production.

## Deployment

Connect the repository to Vercel, select Node 24, configure environment variables and the final domain, and let the main-branch Git integration deploy. Run production migrations as a protected release step before that deployment. The included CI workflow checks code and uses temporary Neon branches on configured internal PRs, deleting them after integration tests. Set NEON_PROJECT_ID, NEON_TEST_PARENT_BRANCH and NEON_API_KEY in GitHub; protected deployment automation and live-provider secrets must be configured by the owner.

Measure the five heaviest workspace/analytics/search/history/recurrence queries with `EXPLAIN (ANALYZE, BUFFERS)` on a disposable branch. Seed large performance fixtures separately; the user-account seed intentionally does not add demo activity. The two-second dashboard target, 50k-session load test, complete file/email E2E flow and external error reporting are not verified until real services are configured.
