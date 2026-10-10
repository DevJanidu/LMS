# Production environment audit — 10 October 2026

**Configuration ready for Vercel import; deployment and full feature sign-off remain conditional.** The owner selected the existing `.env.local` services and the production origin `https://acadence.janidudev.com`. The private `.env.production` contains all 18 application configuration keys. The follow-up email setup populated the Resend key and sender; optional Google OAuth remains empty. Secrets were never printed and the file is ignored by Git.

| Check | Result |
| --- | --- |
| Production environment schema | Passed |
| HTTPS application origin | Passed |
| Pooled/direct Neon connection pair with TLS | Passed |
| Live pooled and direct database connectivity | Passed |
| Committed migration journal | All six verified; no migration executed |
| Upstash authentication/connectivity | PING passed |
| Private storage credentials and bucket access | Passed |
| Anonymous HEAD on an existing object | Denied |
| Production bucket CORS | Exact origin rule added; existing rules preserved |
| Browser PUT preflight with content-type/checksum headers | Passed |
| Production cache namespace | `production` |
| Seed/test/AWS alias exclusion | Passed |
| Standard build | Passed |
| Build with exact production file injected | Passed |
| TypeScript | Passed |
| Lint | Passed |
| Latest unit suite, including email tests | 220 passed; 12 integration tests skipped |
| Production checker regression tests | 3 passed |

The initial migration hash mismatch was caused by LF/CRLF differences in the Windows checkout. Both SQL content and the migration journal timestamp were subsequently verified. No database schema or application data was modified.

The only provider mutation by the agent was adding the production origin to bucket CORS. Existing local origins were preserved. The Neon OPTIONS response allows anonymous cross-origin signed uploads; no object upload, deletion, email send or cron execution was performed. During the email follow-up, the owner supplied a Resend API key and the read-only provider check confirmed the sending domain is verified.

## Remaining deployment steps

- Import `.env.production` into the Vercel project's **Production** environment and redeploy. Remote Vercel environment values were not accessible or changed.
- Select Node 24.x and Next.js defaults. The repository now declares `engines.node=24.x`.
- Use Pro or Enterprise for the current 15-minute/hourly cron schedules; Hobby rejects these intervals. See [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- Configure the production domain in Vercel and verify the DNS records and HTTPS. DNS and live deployment behavior were not verified here.
- Import the configured `RESEND_API_KEY` and `EMAIL_FROM` into Vercel. The sender is `Acadence <hello@acadence.janidudev.com>` and the provider confirmed the domain is verified. Test an actual registration greeting and password-reset delivery before feature sign-off. Google OAuth is optional and disabled.
- After deploying, smoke-test health, login/logout, signed uploads/downloads and cron logs. Complete the skipped integration/browser release coverage and verify backup recovery separately.

Use [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for the exact variable inventory, import settings and repeatable commands, and [EMAIL_SETUP.md](EMAIL_SETUP.md) for registration email behavior. The email follow-up also prepared `EMAIL_FROM` in `.env.local`. Development and production use the same provider resources at the owner's request; `CACHE_NAMESPACE=production` separates application cache keys from local development keys.
