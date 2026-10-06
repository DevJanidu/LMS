# Security

Learner and admin pages check the current database account status and role on the server. The proxy cookie check is only an early redirect. Every domain mutation locks the authenticated user's row, validates its operation with Zod, and checks subject ownership and topic/subject membership. Composite foreign keys reinforce that chain. Client user IDs, roles, completion timestamps and timer durations are not used as authority.

Better Auth stores database sessions and uses Argon2id for credentials. Session cookie caching is disabled so deactivation takes effect on the next authenticated request. Deactivation removes sessions and writes an audit record. The public signup hook always creates a learner and requires Terms acceptance. The requested seed credentials belong only in a gitignored environment file.

Admin workspace queries select account and activity statistics. Subject titles are replaced with neutral labels; topic descriptions, resource titles/content/URLs/storage keys, schedule text and session notes are omitted. The deliberate-content-inspection stub throws. Storage statistics include sizes and owners only.

Production authentication and upload throttles use atomic Upstash Redis counters through REST. The in-memory fallback is available only outside production. Configure a trusted proxy that overwrites `X-Forwarded-For`; Vercel supplies this header. Rate-limit failures deny requests. Mutating auth route handlers require the configured APP_URL origin. Server Actions use Next.js origin checks.

File requests validate extension/MIME agreement, size and reserved plus confirmed quota. Confirmation checks storage metadata and copies bytes to an immutable final key; the upload URL never authorizes that final key. Downloads require learner ownership, expire after five minutes and use attachment disposition. A database trigger queues storage cleanup even when metadata disappears through a cascade. Cleanup skips objects still referenced by resources.

Next.js response headers include CSP, frame restrictions, nosniff, referrer policy and production HSTS. CSP permits inline scripts/styles for the existing Next.js application. A nonce-based strict CSP is a possible later hardening step, not an implemented guarantee.

No passwords, session tokens, signed URLs or document bodies should enter logging. Better Auth's logger and Next.js development request/action-argument/browser forwarding logs are disabled. Job failure logs contain only an event and job name; Next.js request instrumentation records router/route types without error text, stacks, paths or headers. Production startup validates required configuration. Review infrastructure log collection before launch. A third-party error-tracking destination has not been provisioned.

Verification commands:

```sh
npm run lint
npm run typecheck
npm test
npm audit
npm audit --omit=dev
```

The ownership integration suite is intentionally skipped unless `TEST_DATABASE_URL` points to an isolated disposable branch and `TEST_DATABASE_ISOLATED=true`. It logs in as learner A and rejects reads/updates/deletes of B's records, validates timer uniqueness/cascades, checks admin privacy and rejects deactivated accounts. A skipped test is not a security pass.

Owner launch decisions remain: real Terms/Privacy text, minimum age, parental consent and launch-country rules. The minimum-age setting defaults to 0 (unset); a positive setting requires DOB and rejects registrations below that age. Do not launch with placeholder policies. Do not use development seed credentials as production credentials.
