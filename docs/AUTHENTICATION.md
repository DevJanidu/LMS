# Acadence Authentication & Authorization

Acadence signs people in **only with Google**. There is no email/password form, no
sign-up tab, no password reset and no email verification flow.

## Sign-in flow

1. `/login` renders `GoogleSignInCard` (`src/components/auth/GoogleSignInCard.tsx`): one
   "Continue with Google" button plus the Terms and Privacy Policy footer. `/register`
   redirects to `/login`.
2. The button calls `authClient.signIn.social({ provider: "google", callbackURL })`
   (`src/lib/auth/client.ts`). `callbackURL` is `/login`, or `/login?returnTo=<path>`
   when the server accepted the requested path with `safeReturnPath`.
3. Better Auth completes the OAuth exchange at `/api/auth/callback/google`, creates or
   links the account and session, then returns the browser to `callbackURL`.
4. `/login` sees the session and redirects with `loginDestination(role, onboarded, returnTo)`:
   - `super_admin` → `/admin` (or an `/admin…` returnTo);
   - learner without `onboarding_completed_at` → `/onboarding`;
   - onboarded learner → `/dashboard`, or an allowed learner returnTo. A learner can never
     be sent to `/admin`.
5. OAuth failures return to `/login?error=<code>`. `signInErrorMessage` maps the code to fixed
   copy (`accountInactive`, `agePolicy` or `googleSignInFailed`); provider text is never shown.

## Account creation and linking

Policy lives in `src/lib/auth/policy.ts` and runs inside Better Auth's transaction.

- **Verified email only.** `beforeUserCreate` refuses any Google identity whose
  `email_verified` claim is not `true` (`/login?error=EMAIL_NOT_VERIFIED`), so nobody can claim
  an address before its owner. It then forces `role = learner`, `status = active` and a
  lower-cased email (`newAccountFields`).
- **Server-controlled fields.** `role`, `status`, `acceptedTermsAt`, `dateOfBirth` and the
  onboarding fields have `input: false`; profile claims and request bodies cannot set them.
- **Identity = Google `sub`.** Returning users are found by (`google`, `sub`). Google is *not* a
  trusted provider, so Better Auth links an existing row by email only when Google reports the
  email verified. `beforeAccountCreate` additionally refuses a second Google identity for any
  user (`GOOGLE_IDENTITY_ALREADY_LINKED`) and refuses every link to a `super_admin` without a
  one-time operator grant (`ADMIN_LINK_NOT_AUTHORIZED`).
- **Legacy learners.** Password-era rows were never verified locally
  (`requireLocalEmailVerified: false`). Password sign-in is disabled, so the creator of such a
  row cannot use it; a verified Google sign-in for that address takes it over, keeping its data.
- **No provider tokens.** Acadence never calls Google APIs. Access, refresh and ID tokens are
  nulled before an account row is written, and `updateAccountOnSignIn: false` stops them from
  being stored on later sign-ins.

## Administrators

Privilege is bound to an internal user ID and a Google `sub`, never to an email match.

```bash
npm run admin:access -- status
# Existing admin row without Google (e.g. the seeded account): allow one link, 15 minutes.
npm run admin:access -- authorize-google-link --email admin@example.com [--google-sub <sub>] --confirm
# Someone who already signed in as a learner with a verified Google account:
npm run admin:access -- promote --user-id <uuid> --confirm
npm run admin:access -- revoke --user-id <uuid> --confirm
```

Every write is a dry run without `--confirm`, refuses production without `--allow-production`,
ends the target's sessions where the role changes, and writes `audit_logs`. The grant is a
single-use `verifications` row (`admin-google-link:<userId>`); it is consumed on the first link
attempt, successful or not. `npm run db:seed` creates the row only and stores no password.

## Onboarding

The first onboarding step records consent, because no registration form collects it:

- a required Terms/Privacy checkbox (the step has no Skip);
- a date of birth, only while the workspace `minimumAge` setting is above zero.

`acceptOnboardingTerms` stamps `users.accepted_terms_at` (and `date_of_birth`). Below the
minimum age the account is deactivated, its sessions are deleted, an audit row is written and
the browser returns to `/login?error=agePolicy`. `completeOnboarding` refuses to finish until
terms are accepted.

## Access control

- `requireOnboardedLearner()` is the default learner guard for pages and server actions:
  signed in, active, learner, Terms accepted and onboarding complete, otherwise a redirect.
- `requireLearnerAccount()` skips the onboarding check. It is used only by the onboarding page,
  `acceptOnboardingTerms`, `completeOnboarding` and `deleteMyAccount`.
- JSON APIs use `learnerAccessFailure()` (through `learnerAccount()` and the calendar and
  workspace routes): `401 authenticationFailed`, `403 recordUnavailable` (wrong role) or
  `403 onboardingRequired`. `/api/timezone` is open to any active user; it only updates the
  caller's timezone.
- `requireAdmin()` reads the live database role; admin operations in `mutate()` re-check it.
- All learner queries stay owner-scoped by the session's user ID.

## Sessions

- Database sessions, 7-day expiry refreshed daily, cookie cache disabled. Cookies are
  `httpOnly`, `SameSite=Lax`, `Secure` (and `__Secure-` prefixed) in production.
- `readActiveSession()` is the only session read: it rejects inactive users and enforces an
  absolute lifetime that Better Auth's refresh cannot extend (30 days for learners, 12 hours for
  administrators), deleting the expired row.
- Settings → Security (learners) and Admin settings offer *Sign out other devices* and
  *Sign out everywhere*; both delete session rows server-side.
- Deactivation and the age policy delete all of a user's sessions immediately.

## `/api/auth/[...all]` guards

- POST requires `Origin` to equal `APP_URL`. POSTs and the OAuth callback pass a per-address
  database limit of 30/min. The address comes from Vercel's forwarding headers only when
  `VERCEL=1`; elsewhere all requests share one bucket, so spoofed headers cannot evade it.
- Signed out: `sign-in/social`, `callback/<provider>`, `sign-out`, `get-session`.
  Signed in, additionally: `list-sessions`, `revoke-session`, `revoke-sessions`,
  `revoke-other-sessions`. Every other Better Auth endpoint (password, reset, verification,
  `update-user`, `change-email`, `delete-user`, `link-social`, `unlink-account`, token
  endpoints) returns 404.
- Responses are `Cache-Control: private, no-store`.

## Security logging

`src/lib/auth/events.ts` writes JSON lines to the platform log: `auth.sign_in`,
`auth.sign_in_failed`, `auth.sign_out`, `auth.account_linked`, `auth.account_link_rejected`,
`auth.session_revoked`, `auth.session_expired` and `auth.suspicious` (state, nonce, issuer or
code errors, rejected links). Fields are allowlisted: user UUID, role, a sanitized reason code,
a count and a scope. Tokens, cookies, codes, verifiers, secrets and emails are never written.
Better Auth's own warnings are kept as a level plus a truncated message (arguments dropped).
Administrator sign-ins, Google links, CLI role changes and session revocations are also kept
in `audit_logs`, visible to administrators. Platform logs follow the Vercel plan's retention;
`audit_logs` is kept until an operator prunes it.

## Content Security Policy

`src/lib/security/csp.ts` builds both policies. `src/proxy.ts` sends a per-request nonce policy
on the signed-in app and `/login`: inline scripts run only with Next.js's nonce or as the
SHA-256-allowed theme script. Statically rendered marketing pages keep the baseline policy
from `next.config.ts` (`script-src 'self' 'unsafe-inline'`), because a static page cannot carry
a per-request nonce; they render no user data.

## Environments

| | Local | Staging (Vercel preview, stable domain) | Production |
|---|---|---|---|
| Google OAuth client | own client | own client | own client |
| Redirect URI (exact) | `http://localhost:3000/api/auth/callback/google` | `https://<staging-domain>/api/auth/callback/google` | `https://acadence.janidudev.com/api/auth/callback/google` |
| `APP_URL` | `http://localhost:3000` | staging domain | `https://acadence.janidudev.com` |
| `AUTH_SECRET`, Google secret | unique | unique | unique |
| Neon | development branch | staging branch | production branch |

Google does not accept wildcard redirect URIs, so random `*.vercel.app` preview URLs cannot sign
in. `src/lib/env.ts` refuses a hosted deployment whose `APP_URL` is not HTTPS, and a preview
deployment whose `APP_URL` is the production origin. Publish the production consent screen
("In production") once the client is ready; `openid email profile` are non-sensitive scopes.

### Rotating the Google client secret

1. Google Cloud → APIs & Services → Credentials → the OAuth client → *Add secret*.
2. Put the new secret in that environment's `GOOGLE_CLIENT_SECRET` (Vercel or `.env.local`)
   and redeploy.
3. Sign in once to confirm, then disable and delete the old secret in Google Cloud.

Rotating `AUTH_SECRET` invalidates every session cookie (all users sign in again).

## Data cleanup (approval required)

`npm run auth:cleanup` prints counts. `--clear-provider-tokens --confirm` nulls stored Google
tokens; `--delete-password-accounts --confirm` removes dormant password hashes. Neither touches
users, Google identities or learning data. Take a Neon branch snapshot first.

## Testing

- `tests/auth-linking.test.ts` runs the real Better Auth engine with an in-memory adapter
  through `sign-in/social` and `/callback/google` (Google's token endpoint stubbed): new and
  returning learners, unverified emails, pre-hijacking, administrator linking and grants,
  legacy learners, second Google identities, forged, missing, cross-browser and replayed state,
  forged, expired and revoked session cookies, cookie flags and token stripping.
- `tests/auth-policy.test.ts`: access decisions, absolute lifetimes, log redaction and CSP.
- `tests/auth-google.test.ts`: provider config, forced learner role, inactive-session block,
  routing, error mapping and env validation.
- `tests/auth-route.test.ts`: endpoint allowlists, origin and rate limits, trusted client
  addresses, absolute lifetime on `get-session` and failure logging.
- `tests/e2e/*`: browser checks; database-backed specs use `tests/e2e/google-session.ts` and
  must run against an isolated test branch.
