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

Current status (10 October 2026): sender and application flow are implemented and tested. The owner supplied the production Resend API key; the live provider check confirmed `acadence.janidudev.com` is verified and all production connection checks passed. Build, lint, TypeScript and 220 tests passed; 12 integration tests were skipped. A real test registration and inbox delivery check remain outstanding. The local development file has the sender prepared; configure its API key separately if local email delivery is needed.
