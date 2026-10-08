# Test execution results

## Environment

Local Windows workstation, Node 24, Next production build, Chrome headless, PostgreSQL 18.6 and configured object storage. The production audit ran on `http://localhost:3100` with acknowledged audit fixtures. No production data was reset or deleted.

## Round 1 — discovery and baseline

| Check | Result |
|---|---|
| Vitest | 14 files passed; 177 passed, 8 skipped |
| Analytics/schedule scripts | 13 passed |
| TypeScript | `npm run typecheck` passed |
| ESLint | `npm run lint` passed |
| Drizzle schema | `npx drizzle-kit check` passed |
| DB/connection check | PostgreSQL 18.6, pool, seed user, six migrations passed |
| Storage check | Anonymous denial, signed PUT/HEAD/download and tamper rejection passed |
| Public browser E2E | Passed |
| Learner registration/timer E2E | Skipped: `E2E_DATABASE_READY` is not configured |
| Production route audit | Learner and admin login plus all listed routes passed |

The production audit recorded `docs/QA_METRICS.json` and `docs/SERVICE_METRICS.json`. Learner routes were `/dashboard`, `/subjects`, `/study`, `/study/history`, `/calendar`, `/analytics`, `/resources`, and `/settings`; admin routes were `/admin`, `/admin/users`, `/admin/analytics`, `/admin/storage`, and `/admin/settings`.

## Round 2 — defect and regression verification

The calendar browser audit reproduced a defect: after a failed drag save, React state rolled back but FullCalendar's already-moved DOM node stayed at the dropped position. `StudyCalendar.tsx` now calls FullCalendar's `revert()` callback when the mutation fails. The focused calendar store tests, all unit tests, lint, typecheck and production build pass after that change.

The rerun reached the failed-move rollback and then stopped in the resize phase. The harness waited for an `/api/calendar` JSON response, while the observed request was a Next server-action POST to `/calendar`; the captured failure also showed a delete dialog. This is recorded as a blocked harness assertion, not as a product pass.

## Round 3 — final regression state

The final code checks remain green: 177 Vitest tests passed with 8 skips, 13 analytics/schedule checks passed, typecheck/lint/build passed, connection/storage checks passed, and production route checks passed. The ownership integration runner was stopped after hanging against the current acknowledged database; cross-user live assertions therefore remain blocked. Prettier reports 161 existing files needing formatting and was not run as a mass rewrite.

