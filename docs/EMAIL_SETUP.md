# Acadence transactional email

The configured sender is `Acadence <hello@acadence.janidudev.com>`. This is a sending identity; an inbox for replies requires separate receiving/mailbox configuration.

Sign-in is Google-only (see [authentication](AUTHENTICATION.md)), so email is used only for the welcome message. There are no password-reset or verification emails.

1. In [Resend Domains](https://resend.com/domains), add **acadence.janidudev.com** as the exact sending domain.
2. Add the DNS records Resend displays at the DNS provider for `janidudev.com`. Copy the actual DKIM, SPF and return-path records from your account; their values cannot be generated from the domain name. Use the relative record names appropriate to your DNS provider and preserve existing website and mail records.
3. Click Verify and wait for the domain's sending status to become **Verified**. Keep click/open tracking disabled for account emails. See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).
4. Create a Resend API key and put it in `RESEND_API_KEY` in `.env.production`. `EMAIL_FROM` is already configured. Set the same two variables in Vercel's **Production** environment and redeploy. Do not put the key in chat or Git. If local sending is needed, also configure `.env.local`.
5. Run `npm run check:email`. This requires email credentials and checks the sender domain using Resend's domain API, in addition to the application connections. A sending-only API key may lack domain-list permissions; verify the domain in the Resend dashboard in that case. No email is sent by this checker.
6. Sign in with a new Google account you control, then check the received greeting and Resend delivery status. API acceptance alone does not confirm inbox delivery.

## Registration behavior

Better Auth's new-user creation hook schedules a welcome email after persistence. It runs when a first Google sign-in creates the account and is not called on ordinary sign-ins or when Google is linked to an existing account. The message uses the user's name, a thank-you message and the production onboarding link.

Sending uses `APP_NAME` (Acadence) for the subject and message, and the configured Acadence sender. The Resend request includes `welcome-user/<user-id>` as an idempotency key; Resend deduplicates that key for 24 hours. Failures are logged without addresses, secrets or provider error contents and do not fail sign-in. This is a best-effort background send, without a durable retry queue. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

A prepared sender without an API key is allowed so the application can continue running during setup. Welcome sending stays disabled until both are supplied. Invalid sender addresses and header injection are rejected by environment validation.

The 10 October checks used the private local production configuration file; those checks do not prove that the same values were imported into the hosted Vercel environment. The local development file has the sender prepared; configure its API key separately if local email delivery is needed.

## Account service configuration

Startup validates server configuration and logs only invalid setting names as
`startup_configuration_invalid`. Account services require `DATABASE_URL`,
`AUTH_SECRET` (at least 32 characters), the correct `APP_URL`, and
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. Storage, cron, migration and Redis
settings do not block sign-in. The database is validated independently, and
`/api/health` reports its readiness. The standard `BETTER_AUTH_SECRET` /
`BETTER_AUTH_URL` aliases are accepted when the app-specific names are absent.
Readiness returns only invalid core setting names, never values. Vercel production
defaults a missing/invalid public `APP_URL` to the canonical origin
`https://acadence.janidudev.com`; a valid explicit URL takes precedence and
previews require their own origin. Signing secrets have no fallback.

On 11 October, the live Resend domain API confirmed the sender is verified using
the local production key.
