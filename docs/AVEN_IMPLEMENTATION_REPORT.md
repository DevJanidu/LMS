# Aven implementation and verification

Specification: `aven.md`. Baseline audit: `AVEN_GAP_ANALYSIS.md`. Progress: `AVEN_IMPLEMENTATION_CHECKLIST.md`.

## Implemented

- One-time privacy onboarding, separate reminder/resource/push permissions, remembered conversation selection, URL navigation, older-thread pagination, and live consent rechecks.
- Draft preservation, retry of a saved message without another user row, interruption recovery, terminal errors, Stop, timeout handling, byte-bounded history, safe stream finalization, and real token accounting.
- Thirty scoped tools for existing LMS records and approval proposals. New capabilities include profile/streak reads, paginated goals, calendar ranges, batch moves/cancellation, ongoing weekly commitments, milestones, goal completion/reopening, study/reminder preferences, resource organization, and approved memory.
- Transactional owner/version/conflict checks, preserved durations and subject colors, destructive cancellation confirmation, before/after schedule previews, safe preference and schedule-move undo, and minimal tool/approval audit records.
- Grouped proactive conversation events with a specific notification reply context, Start/Reply/Reschedule/Skip/Snooze actions, current-activity suppression, notification spacing, daily caps, quiet hours, live opt-outs, and in-app channel filtering. Weekly summaries use recorded hours, completed-task timestamps and real deadlines.
- A compact icon navigation, roomy viewport chat, collapsible history, left/right bubbles, timestamps, friendly activity states, persistent composer, and advanced preference sections. Conversation memory remains outside chat. Existing tasks and the simple goal form are preserved.
- Pending-action reply buffering and corrective provider requests for common unsupported execution claims. The model has no write access without a saved approval proposal. Ambiguous clock requests expose only read tools until the student clarifies AM/PM.
- The shared $5 monthly cap remains server-enforced, with no daily chat allowance. Minimal anonymized usage records survive account deletion. Routine reminders use no paid model calls.

## Verification

Verified before the final release checks:

- Unit suite and analytics checks pass. The final run passed 320 unit tests plus 13 analytics checks. Forty-one database/provider cases are opt-in in the default suite; the relevant Aven suites were run separately against disposable fixtures.
- Nine new real database tests pass: retry/replay fencing, cancellation, atomic rollback, single-day retrieval, recurrence/cancellation, preference undo/concurrent edits, resource privacy and memory, missed-event deduplication/reply/snooze, random check-ins with activity suppression, and anonymous budget retention.
- Existing goal/Aven database regressions passed twelve cases in the broad run. The remaining task/dependency CRUD case exceeded its original 120-second allowance; it passed separately in 141 seconds with a bounded 240-second allowance. No assertion was removed.
- A genuine OpenAI 401 was persisted and displayed. Browser retry produced a real OpenAI answer while keeping exactly one user message. The deliberately invalid credential was confined to that test request; environment files were unchanged.
- Real browser journeys verified one-time onboarding after refresh, a persisted normal OpenAI reply, actual tomorrow schedules, AM/PM clarification, one approved batch move, and immediate/refreshed planner times with preserved duration and color.
- Migrations 0008 and 0009 were applied to the configured database, and Drizzle migration consistency passes. Type checking and lint pass at the recorded checkpoint. Production OpenAI model metadata access returns HTTP 200.

Final verification passed: production build, strict TypeScript, lint, migration consistency, safe schedule-move undo, genuine streamed Stop/cancellation, missed-session reply through an approved cross-day move, and a randomized check-in opened from Notifications with live goal retrieval. Desktop/mobile, the real theme toggle, sidebar collapse/expand, and horizontal-overflow checks passed. The latest product decision makes the app English-only; other translation dictionaries, language options and RTL selection are removed. Browser verification also passed with an Arabic browser language and legacy cookie: the app remained English/LTR, the old `/ar/aven` URL redirected to `/aven`, and the removed language option stayed absent. The real five-turn browser walkthrough settled $0.0353 in tracked model usage; no replies in that walkthrough were mocked.

The private production configuration's schema, database connections, all ten migrations, Redis, storage/CORS/private-object access and verified email sender domain checks passed. This is configuration verification, not proof that Vercel has already deployed the new commit.

| Specification scenario | Result | Evidence |
| --- | --- | --- |
| A Onboarding | Passed | Privacy choice persisted; refresh did not repeat setup |
| B Conversation | Passed | Real OpenAI name reply, stored rows, restored thread after refresh |
| C Schedule retrieval | Passed | Actual Spring Boot and Docker sessions with account-local times |
| D Rescheduling | Passed | AM/PM and sequencing clarification, one batch card, approved transaction |
| E Missed session | Passed | Deduplicated event, real reply, approved next-day move with preserved duration/color |
| F Random check-in | Passed | Bounded worker event, Notification-center Reply, real goal-tool retrieval |
| G Loading | Passed | Friendly activity, Send/Stop, composer remains visible |
| H Provider failure | Passed | Genuine 401 displayed, real successful retry, one user message |
| I Isolation | Passed | Cross-account conversation/proposal/resource access rejected |
| J Persistence | Passed | Planner immediately and after refresh showed saved new times |

## Deployment and configuration

Private `.env.local` and `.env.production` already contain OpenAI, cron, VAPID and the $5 cap configuration. Production email settings are present; local email settings are absent. Environment values are ignored by Git and are not included in the release.

For Vercel, deploy this commit in the existing Acadence project and keep the corresponding variables in that project's **Production** environment. Private local files do not update Vercel variables. Run `npm run db:migrate` for a different deployment database; do not edit applied migrations. Both migrations preserve compatibility with the previous deployment.

Keep the external scheduler's secured GET `/api/cron/aven`, `Authorization: Bearer <CRON_SECRET>` and five-minute schedule. Aven reminders operate without a browser or an OpenAI generation. Browser push requires the learner's permission/subscription; email requires an opted-in learner and valid Resend delivery configuration. A delivery is recorded as successful only after its provider acknowledges it.

Run `npm run test:aven` for disposable database verification, or `npm run test:aven -- --provider` with the local app running for genuine provider/browser journeys. The provider option makes paid requests under the configured cap. Tests generate their own UUID fixtures and do not edit real learners.

The UI budget is the app's ledger and configured cap, including conservative reservations for uncertain/cancelled provider usage. It is not an OpenAI account balance. Model prices are configurable; the current economical model's pricing was checked against [OpenAI's model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Boundaries

- Acadence has no separate assignments/exams database module. Aven explicitly reports that limitation and uses existing goals, tasks, subjects/topics and calendar commitments instead of inventing records.
- A future schedule move can be undone only while its saved versions and conflicts still permit it. Destructive deletions and an already-past original time are not silently restored. Recurring conflicts are checked for up to one year at approval.
- Real email/browser-push delivery to a learner has not been exercised in this run. Permission, subscription and deployment-specific deliverability must be checked in the target browser/environment.
- Acadence is English-only, including Aven, reminders, account emails and date-picker labels. Country/timezone support remains independent of interface language. Existing AI language preferences normalize to English.
- Scheduler work remains bounded per invocation and should be monitored as the learner count grows. Routine scheduling is deterministic; conversational reasoning uses OpenAI only when requested.
