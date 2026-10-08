# Prompt: Build the full backend, connect it to the UI, and make the LMS production-ready

Paste everything below the line into Codex (GPT-6.1 Sol, medium effort; raise to high for the timer, recurrence and security steps). Run it from the root of the project that already contains the converted LMS UI. Keep `Final_SRS_Universal_LMS.md` in the repo (for example `docs/SRS.md`) so it can be read.

---

## ROLE
You are a senior full-stack engineer. This repository is a **Next.js (App Router) + TypeScript + Tailwind** app whose UI was converted from TailAdmin into a **Universal Learning Management System** and currently runs on **mock data** (`lib/mock/`). Your job is to build the **complete backend inside the same Next.js app** and connect the UI to it so the product is **ready for production**.

The single source of truth for behaviour is **`docs/SRS.md`** (Final SRS: Universal LMS MVP v1.0). Read it completely first. If the SRS and this prompt ever disagree, stop and ask me.

## FIXED STACK (do not substitute without asking)
- **Next.js** App Router, TypeScript strict. Backend = **Server Actions** for mutations from the UI, **Route Handlers** (`app/api/...`) only where needed (auth callbacks, signed upload/download URLs, cron endpoints, health check).
- **Database:** **Neon Postgres** (serverless), accessed with the Neon serverless driver and **Drizzle ORM** + **drizzle-kit migrations**.
- **File storage:** **Neon Object Storage** (S3-compatible, private bucket). Use the AWS S3 SDK (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) pointed at Neon's S3 endpoint. **Read Neon's current Object Storage docs before coding** (endpoint, credentials, region, bucket creation, presigned URL support, CORS) and do not guess these details. Keep all storage access behind one module (`lib/storage`) so the provider can be swapped.
- **Auth:** a proven library, not hand-rolled crypto. Use **Better Auth** with the Drizzle adapter (email + password, sessions in Postgres, Google OAuth as optional). If you judge Auth.js (v5) clearly better for this repo, explain why in one paragraph and wait for my OK.
- **Validation:** Zod on every input (server side), shared with forms.
- **Email:** Resend (password reset, verification) behind `lib/email`.
- **Hosting target:** Vercel (app) + Neon (database and storage).

## NON-NEGOTIABLE RULES
1. **Every learner query and mutation is scoped by the authenticated user id on the server.** Never trust an ID from the client. Verify ownership through the chain (user → subject → topic/resource/session). Learner A must never be able to read or change Learner B's data by editing an ID.
2. **Admin checks happen on the server** for every admin page, action and route. Never rely on hidden UI.
3. **Super Admin must NOT be able to see learner notes, session notes, file contents or file names/titles by default.** Admin screens return only numbers and account info. Any deliberate content access (not needed in MVP; leave a stub that throws) must write to `audit_logs`.
4. **No secrets in code.** Use environment variables, validated at boot with Zod (`lib/env.ts`); the app must fail fast with a clear message if one is missing.
5. **Store all timestamps as UTC (`timestamptz`)**; convert to the user's IANA time zone only in presentation and in analytics queries.
6. Never log passwords, tokens, signed URLs, or document contents.
7. Do not add features outside the SRS (no teachers, classes, grading, billing, chat, AI, social features).
8. Prefer small, typed, tested modules. No `any`. No dead code or unused template leftovers.

## STEP 0 — AUDIT
Inspect the repo: routes, mock data shapes in `lib/mock/` and `types/`, all places the UI reads or writes mock data, forms, the timer store, and the calendar. Produce a short plan listing every mock function that will be replaced by a real data-access function. Keep the existing function names/signatures where sensible so UI changes are minimal.

## STEP 1 — PROJECT FOUNDATION
- Install: `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `zod`, the auth library, `resend`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, and test tooling (`vitest`, plus Playwright for e2e).
- `lib/env.ts` (validated env), `lib/db/index.ts` (Neon + Drizzle client), `drizzle.config.ts`, npm scripts: `db:generate`, `db:migrate`, `db:studio`, `db:seed`.
- Provide `.env.example` listing every variable (never real values): `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (for migrations), `AUTH_SECRET`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID/SECRET` (optional), `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `CRON_SECRET`.
- Use a Neon **branch** for development and a separate one for production; document this in the README.

## STEP 2 — DATABASE SCHEMA (Drizzle)
Implement exactly the SRS data model (Section 19), with these requirements:
- Tables: `users`, `user_preferences`, `subjects`, `topics`, `resources`, `active_timers`, `study_sessions`, `schedule_blocks`, `schedule_exceptions`, `notifications`, `password_resets` (or the auth library's equivalents: `sessions`, `accounts`, `verifications`), `audit_logs`, `app_settings`.
- Use UUID primary keys, `timestamptz` timestamps, enums (or checked text) for: role (`learner`, `super_admin`), user status (`active`, `deactivated`), subject status (`active`, `archived`), topic status (`not_started`, `in_progress`, `completed`), resource type (`file`, `link`, `video`, `note`), session source (`timer`, `manual`), session status.
- **Foreign keys with `ON DELETE CASCADE`** along user → subjects → topics/resources/sessions/schedule_blocks, so deleting a subject or user leaves no orphans (SRS rule 7). Resource rows with files need a cleanup path (see Step 7).
- `active_timers.user_id` is the primary key/unique so **only one timer per learner** is enforced by the database.
- CHECK constraints: `ended_at > started_at`, `duration_seconds >= 0`, `size_bytes >= 0`; a session's topic must belong to the same subject (enforce in code and, if practical, with a composite foreign key).
- Indexes: `(user_id)`, `(subject_id)`, `(topic_id)`, `study_sessions(user_id, started_at)`, `schedule_blocks(user_id, starts_at)`, `resources(user_id, subject_id)`, `topics(subject_id, sort_order)`, `users(email)` unique, `audit_logs(created_at)`.
- Generate and commit migrations. Write `db:seed` that creates: one Super Admin (email/password from env, never hard-coded), and an optional **demo learner** with the same mock subjects (Mathematics, Algorithms, AWS Solutions Architect with 7/10 topics) and 3 weeks of sessions — seed must refuse to run in production unless a flag is passed.

## STEP 3 — AUTHENTICATION AND AUTHORIZATION
- Email + password sign-up/login/logout, password reset via emailed expiring single-use link, optional email verification (SHOULD), optional Google login (SHOULD), account deletion (MUST).
- Password: min 8 chars; hashing handled by the auth library (argon2/scrypt/bcrypt, never plain text).
- Sign-up requires accepting Terms/Privacy and stores `accepted_terms_at`; store the optional age/date-of-birth field exactly as the UI collects it.
- **Super Admin is never created through public sign-up.** Only through the seed script or a one-off CLI command.
- Deactivated users cannot log in and existing sessions are rejected on the next request.
- Secure cookies (httpOnly, secure, sameSite=lax), session expiry, rotate session on login.
- **Middleware** protects `/(learner)` routes and `/admin`; but the real checks live in server helpers:
  - `requireUser()` → returns the user or redirects/throws 401
  - `requireAdmin()` → also checks role === `super_admin`, else 403
  Every server action and route handler begins with one of these.
- **Rate limiting** on login, sign-up, password-reset request, and file-upload URL creation (use Upstash Redis / Vercel KV via a small `lib/rate-limit` wrapper, with an in-memory fallback for local dev only).
- CSRF: rely on Server Actions' built-in protections and `sameSite` cookies; for any route handler that mutates, verify the `Origin` header.
- Add security headers in `next.config` (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`/`X-Frame-Options`, HSTS in production).

## STEP 4 — DOMAIN SERVICES AND SERVER ACTIONS
Create a clean layering: `lib/services/*` (business logic + DB queries, always receive `userId`), thin Server Actions in `app/**/actions.ts` (parse with Zod → call service → `revalidatePath`/`revalidateTag`), and typed result objects `{ ok: true, data } | { ok: false, error }` (no thrown stack traces to the UI). Implement:

**Subjects:** create, update, archive/unarchive, delete (confirmation handled in UI), list with progress and total study time, get by id. Enforce per-user limit (50 active subjects).
**Topics:** create, bulk create (one per line), update, set status (sets/clears `completed_at`), delete, **reorder** (transactional update of `sort_order`). Enforce 200 topics per subject.
**Progress:** a single function: `completed active topics ÷ total active topics × 100`; no topics → `null` ("No topics yet"). Derived on read (SQL aggregate), never stored, never editable.
**Resources:** create link/video/note; file flow in Step 7; list/filter by subject, topic, type; update; delete (also deletes the object). Validate URLs (http/https only; reject `javascript:`/`data:`), optional YouTube thumbnail derivation on the client.
**Timer:**
- `startTimer(subjectId, topicId?)`: transaction; fails if an active timer exists; verifies subject/topic ownership and that the topic belongs to the subject. Stores `started_at` (server time).
- `pauseTimer`, `resumeTimer`: maintain `paused_at` and `paused_total_seconds`.
- `finishTimer(note?)`: computes `duration = now − started_at − paused_total` **on the server**; applies rules: **< 60 s is discarded with a friendly result**, **> 6 h is capped** unless confirmed by the "still studying?" flow; creates the `study_sessions` row and deletes the active timer in **one transaction**; sets `source = 'timer'`.
- `discardTimer`, `getActiveTimer` (used by the global indicator).
- Elapsed time shown on screen is computed from the server-provided `started_at`, never from a client counter alone.
**Sessions:** list with filters (date range, subject, topic) and pagination; **manual create/edit/delete** with validation (end after start, not in the future, not overlapping a running timer if you choose, topic belongs to subject).
**Schedule blocks:** create/update/delete one-time and weekly blocks; store recurrence as an RRULE-like string or a small JSON rule (weekday list, until date); expand occurrences for a requested date range **on the server** (`getBlocksInRange(from, to)` including exceptions); "this one only" edits/cancels create a `schedule_exceptions` row, "all future" splits the series (end the old rule, create a new one); overlap detection returns a warning, not an error. Respect the user's time zone and DST when expanding.
**Deadlines and reminders:** subject/topic `target_date` queries for the calendar and dashboard; in-app notifications generated by the cron job (Step 8) for upcoming blocks and deadlines; mark-as-read action.
**Settings:** profile (name, time zone, week start day, theme), weekly goal, delete account (removes all data and all stored files), **export my data** as JSON (SHOULD).
**Search:** `search(query)` across the user's subjects, topics and resource titles (ILIKE with trigram index, or Postgres full-text search); always scoped by `userId`.

## STEP 5 — ANALYTICS (SQL, in the user's time zone)
Implement in `lib/analytics/*` with unit tests against fixtures:
- **Study time** today / this week / this month using `AT TIME ZONE <user tz>` and the user's week-start preference.
- **Daily study time** for the last 7 days, **study time by subject** (week/month/all), **monthly heat-map** (minutes per local day).
- **Study day** = a local day with **≥ `streak_min_minutes` (default 10, from `app_settings`)** total valid minutes.
- **Current streak:** consecutive study days ending today, or ending yesterday if today has no study yet (not broken until the day ends). **Longest streak:** best historical run. Use a gaps-and-islands SQL query or an efficient in-code pass over daily totals.
- **Weekly goal %** = `weekly minutes ÷ target minutes × 100` (cap the bar at 100 but return the true minutes).
- **Topics completed this month** from `completed_at`.
- Handle sessions that cross midnight by splitting minutes across local days.
- Return DTOs shaped like the existing mock data so the UI barely changes.
- Cache nothing in the MVP unless a query exceeds ~200 ms on seeded data of 50k sessions; if so, add targeted indexes first, caching second.

## STEP 6 — SUPER ADMIN BACKEND
All through `requireAdmin()`:
- KPIs: total users, active users (had a session or login in last 7 days), new users this week, sessions today, total study hours, active subjects.
- Users list: search, sort, pagination (name, email, joined, last active, total study time, status).
- User detail: account info, study time per day/week, streaks, subjects with titles **replaced by neutral labels if you decide titles are private**, or show titles but **never** topic notes, session notes, resource titles, or files. Default to **showing counts and progress %, hiding private text** — and note this choice in the PR summary.
- Deactivate / reactivate (writes `audit_logs`, invalidates sessions).
- Platform analytics (DAU/WAU/MAU, sessions per day, average session length, aggregate hours, subjects created, topics completed) and storage usage (total and per user).
- Admin settings: streak minutes, max file size, per-user storage quota (stored in `app_settings`, cached in memory for 60 s).
- Audit log viewer (paginated, read-only).

## STEP 7 — FILE UPLOADS (NEON OBJECT STORAGE)
- Private bucket; object keys like `users/{userId}/subjects/{subjectId}/{uuid}-{sanitizedName}`. Never use user-supplied names as keys.
- **Upload flow:** client asks a Server Action for a **presigned PUT URL** (after checking auth, rate limit, declared size ≤ limit, type in allow-list, and the user's remaining quota) → uploads straight to storage → calls a "confirm" Server Action that verifies the object exists (HEAD), re-checks size and content type, then creates the `resources` row. Unconfirmed objects are cleaned up by the cron job.
- Allowed types (MVP): PDF, common documents (docx, pptx, xlsx, txt), PNG, JPG. Enforce by MIME and extension; reject everything else. Default limits: **10 MB per file, 100 MB per user** (read from `app_settings`).
- **Download:** a Server Action/route returns a **short-lived presigned GET URL** (e.g. 5 minutes) only after verifying ownership. Set `Content-Disposition` appropriately; serve images/PDF inline only when safe.
- **Delete:** deleting a resource, subject, or account deletes the object(s); if storage deletion fails, record the key in a `pending_object_deletions` table and let the cron job retry.
- Track per-user `storage_used_bytes` (or compute with SUM) for quotas and the admin storage page.

## STEP 8 — BACKGROUND JOBS (Vercel Cron, secured by `CRON_SECRET`)
Route handlers under `app/api/cron/*` that verify `Authorization: Bearer ${CRON_SECRET}` and are idempotent:
1. **Reminders** (every 5–15 min): create in-app notifications for study blocks starting soon and deadlines due tomorrow/today; never duplicate (unique key on user + type + target + date).
2. **Timer sweeper** (hourly): find active timers older than 6 hours, mark them "needs confirmation" or cap them per the SRS rule.
3. **Storage cleanup** (daily): remove unconfirmed uploads older than 24 h and retry `pending_object_deletions`.
4. **Retention** (daily): delete expired password-reset/verification tokens and old notifications (> 90 days).
Add `vercel.json` cron entries.

## STEP 9 — CONNECT THE FRONT END
- Replace **every** import from `lib/mock` with real services/actions; delete `lib/mock` (keep seed data only in `db:seed`).
- Pages read data in **Server Components**; interactive parts (timer, charts, calendar, dialogs, drag-and-drop) are Client Components that call Server Actions. Use `useActionState`/`useOptimistic` where it improves feel (topic checkbox, reorder).
- Global **active-timer indicator** loads the active timer on every learner page (cheap query) and ticks locally from `started_at`.
- Forms: reuse the same Zod schemas on client and server; show field errors; show friendly messages for limits (file size, 50 subjects, 200 topics, too-short sessions).
- Add `loading.tsx`, `error.tsx`, and `not-found.tsx` for each route group; empty states stay.
- Remove the dev role switcher; role comes from the session. Redirect: learners → `/dashboard`, admins → `/admin`, first-time learners → `/onboarding` until completed (store `onboarding_completed_at`).
- Make sure nothing in the client bundle imports server-only modules (`import 'server-only'` in `lib/db`, `lib/services`, `lib/storage`, `lib/email`).

## STEP 10 — QUALITY, SECURITY AND PRODUCTION READINESS
**Tests (must pass in CI):**
- Unit (Vitest): progress %, study-day/streak logic (including time zones, midnight crossing, DST), weekly goal, timer duration/pause/cap rules, recurrence expansion with exceptions, URL and upload validation.
- Integration (against a throwaway Neon branch or a local Postgres): services enforce ownership — **a dedicated test that logs in as Learner A and tries to read/update/delete every kind of Learner B record by ID and expects failure**; only one active timer per user; cascade deletes leave no orphans; deactivated users are rejected; admin routes reject learners.
- E2E (Playwright): sign up → onboarding → create subject and topics → complete a topic (progress updates) → start/pause/refresh/finish timer → session in history and analytics → add link/note/file → create weekly block → admin sees stats but no private text.
**Security review checklist** (output the results in the summary): authorization on every action, input validation, no secrets in client bundle, headers set, rate limits active, file validation, signed URLs short-lived, no sensitive logging, dependency audit (`npm audit`), SQL via parameterised ORM only.
**Observability:** structured logging (no PII), error tracking (Sentry or equivalent, with PII scrubbing), `/api/health` endpoint (checks DB), and basic usage metrics.
**Performance:** no N+1 queries (batch/aggregate in SQL), dashboard < 2 s on a seeded account with a year of sessions, pagination on every list, `EXPLAIN` the 5 heaviest queries and add indexes as needed.
**Accessibility and responsiveness:** re-run checks on new states (errors, loading); no regressions at 360 px.
**Legal/product pages:** `/terms`, `/privacy` (placeholders clearly marked for the owner to replace), and a visible note that the platform admin can see study statistics but not private notes or files. Leave the minimum-age/parental-consent decision as a configurable setting and list it as an open item.
**Backups and recovery:** document Neon point-in-time restore and branch-based testing of migrations; migrations run in CI/CD before deploy, never at app startup.
**CI/CD:** GitHub Actions: install → lint → typecheck → unit tests → build; integration/E2E on pull requests using a temporary Neon branch; deploy to Vercel on `main`. Production environment variables documented, preview deployments use a separate Neon branch.
**Docs:** README (setup in 10 minutes, env table, scripts, architecture diagram in text, folder map, how to create the Super Admin, how to run migrations/seed, how to deploy), `docs/SECURITY.md`, `docs/OPERATIONS.md` (cron jobs, backups, storage cleanup, rotating secrets).

## STEP 11 — DELIVERY RULES
- Work in this order and **commit after each step**: foundation → schema/migrations → auth → services/actions → analytics → admin → storage → cron → UI wiring → tests/CI → docs.
- After each step run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`; fix before continuing.
- At the end give me: (1) routes and actions created, (2) database tables and indexes, (3) env vars required, (4) the security checklist result, (5) test results, (6) anything not done or assumed, (7) the exact manual steps I must do (create Neon project/branches, create the bucket and credentials, set Vercel env vars, create the Super Admin, configure the domain and Resend, set `CRON_SECRET`).
- Ask me before: switching auth libraries, changing the data model, adding any dependency that is not listed, or deviating from the SRS.

## DO NOT
- Do not store files in Postgres.
- Do not trust client-supplied user IDs, roles, durations or timestamps for study time.
- Do not expose admin routes or data to learners, or private content to admins.
- Do not leave mock data, demo credentials, `console.log` of sensitive values, or TODOs that affect security.
- Do not run destructive database commands against production.
