# Acadence transactional email

The configured sender is `Acadence <hello@acadence.janidudev.com>`. This is a sending identity; an inbox for replies requires separate receiving/mailbox configuration.

1. In [Resend Domains](https://resend.com/domains), add **acadence.janidudev.com** as the exact sending domain.
2. Add the DNS records Resend displays at the DNS provider for `janidudev.com`. Copy the actual DKIM, SPF and return-path records from your account; their values cannot be generated from the domain name. Use the relative record names appropriate to your DNS provider and preserve existing website and mail records.
3. Click Verify and wait for the domain's sending status to become **Verified**. Keep click/open tracking disabled for account emails, especially password-reset links. See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).
4. Create a Resend API key and put it in `RESEND_API_KEY` in `.env.production`. `EMAIL_FROM` is already configured. Set the same two variables in Vercel's **Production** environment and redeploy. Do not put the key in chat or Git. If local sending is needed, also configure `.env.local`.
5. Run `npm run check:email`. This requires email credentials and checks the sender domain using Resend's domain API, in addition to the application connections. A sending-only API key may lack domain-list permissions; verify the domain in the Resend dashboard in that case. No email is sent by this checker.
6. Register one real test account with an address you control, then check the received greeting and Resend delivery status. Test password reset separately. API acceptance alone does not confirm inbox delivery.

## Registration behavior

Better Auth's new-user creation hook schedules a welcome email after persistence and the registration response. It covers registration through the Server Action and auth API, and is not called on ordinary logins. The message uses the request's language (English, Arabic, Spanish or German), the user's name, a thank-you message and the production onboarding link.

Sending uses `APP_NAME` (Acadence) for the subject and message, and the configured Acadence sender. The Resend request includes `welcome-user/<user-id>` as an idempotency key; Resend deduplicates that key for 24 hours. Failures are logged without addresses, secrets or provider error contents and do not fail registration. This is a best-effort background send, without a durable retry queue. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

A prepared sender without an API key is allowed so the application can continue running during setup. Welcome sending stays disabled until both are supplied; password-reset requests continue to report email as unavailable. Invalid sender addresses and header injection are rejected by environment validation.

The 10 October checks used the private local production configuration file; those checks do not prove that the same values were imported into the hosted Vercel environment. The local development file has the sender prepared; configure its API key separately if local email delivery is needed.

## Password-reset recovery and feedback

Reset emails now link directly to `/reset-password?token=...`. Existing
`/api/auth/reset-password/<token>` links also open the public form while logged
out, even if a mail client removed their callback query. Caller-provided callback
origins are ignored. The token is validated, expires, and is consumed by Better
Auth when the password is changed; existing sessions are revoked. Reset pages
and redirects prevent caching and suppress referral headers containing tokens.

The request confirmation shows the normalized email entered by the user. It
keeps account-existence responses generic. Email-provider and service failures
produce actionable errors rather than pretending a reset email was sent. Invalid
or expired links offer a fresh-link action, and completed resets show a sign-in
confirmation. Invalid email syntax, missing passwords, new-password length and
confirmation errors identify the relevant form field. Rejected login credentials
use the provider's combined email/password error; no additional account lookup
is introduced to disclose which addresses are registered.

Startup validates server configuration and logs only invalid setting names as
`startup_configuration_invalid`. It no longer aborts all public recovery pages.
Account services require `DATABASE_URL`, `AUTH_SECRET` (at least 32 characters)
and the correct `APP_URL`; reset delivery additionally needs `RESEND_API_KEY`
and `EMAIL_FROM`. Storage, cron, migration and Redis settings do not block account
actions. The database is validated independently, and `/api/health` reports its
readiness. Other LMS features still validate their own service configuration.

## Five reset requests per week

Both Server Actions and the public reset API share five timestamped database
slots per normalized email over a rolling seven-day window. The existing
`auth_rate_limits` table provides persistent counters and a row lock serializes
concurrent reservations; no new migration is required. Account identifiers are
hashed. The sixth request reports the next eligible date, while a failed send
releases only its own reservation. Cleanup preserves weekly rows for seven days.
Login and registration retain independent short-term database admission limits.

Better Auth's callback runner swallows delivery exceptions, so reset requests
track those exceptions using request-local async context. Provider failures now
reach the form/API and release quota instead of returning a false acknowledgement.

## Repeatable full account test

Build first, then run the owned-fixture test against a chosen database:

```powershell
$env:PLAYWRIGHT_ISOLATED_BUILD='1'
npm run build
node scripts/test-auth-lifecycle.mjs --env=.env.local --acknowledge-current-test-database
```

The harness captures Resend HTTP calls in a local mailbox and only permits its
unique `auth-e2e-…@example.invalid` recipient. It creates one tagged account,
selects a birth date in the compact calendar, verifies successful registration,
failed/successful login, a failed send plus five successful reset requests, the
weekly denial, password change, revoked old sessions, old-password rejection,
new-password login and rejection of a reused token. It deletes only that fixture
account, its reset tokens and account quota rows. No external inbox receives mail.
The normal CI public job skips this fixture test unless the harness enables it.

The corresponding database integration suite verifies concurrent admission,
normalized-email quota sharing, independent accounts, slot release and expiry.
It runs only with explicit isolated/fixture-only database opt-in. The local
production configuration has passed the full account lifecycle and those
concurrency checks; actual external inbox delivery is a separate provider check.

On 11 October, the live Resend domain API confirmed the sender is verified using
the local production key. Before this patch was deployed, public checks of the
hosted login, forgot-password, reset-password and health endpoints returned 500.
Hosted configuration and runtime logs require Vercel access; a verified sender
alone does not prove hosted email delivery. No user's reset token was replayed,
no password was changed, and no test email was sent during these checks.
