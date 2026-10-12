# Scheduled study attendance

## Changes and root causes

The floating timer's Finish action was a link to Study. It now opens the shared finish dialog on the current page, pauses the timer, and saves the note/session through the existing authenticated timer transaction. Errors keep the dialog open. Resume also works directly from the floating bar.

Scheduled sessions previously had no attendance record. Aven inferred attendance from nearby study of the same subject, which could incorrectly hide a missed session. Attendance is now stored per account, block, original recurrence date and start-time snapshot. A moved occurrence retains its original date; its previous attendance cannot mark the new time attended.

Dashboard and planner details offer **Attend**. For a subject session this atomically records attendance and starts the matching subject/topic timer. A block without a subject records attendance and opens Study so the learner can choose a subject. Finishing a saved timer session completes its linked attendance. Discarding or finishing under one minute does not invent completed study time; attendance stays attended.

The Study dropdown loads real scheduled occurrences, fills their subject/topic, and lets the learner attend and study. Completed occurrences are excluded. Manual subject/topic selection remains available. The dashboard retains today's earlier uncompleted sessions and shows when no attendance was recorded.

## Aven and reminders

`getCalendar` and `getStudySchedule` include the exact attendance record and derived status. Aven is instructed to distinguish user-reported attendance from saved focus time and to say **no attendance recorded** rather than claiming a learner did not study.

The five-minute Aven worker suppresses session/missed reminders for attended or completed occurrences. After the configured start grace period it can remind about missing attendance or an explicit skip. Skip from an Aven notification now records the skip and retains the planner occurrence. Notification deduplication includes the start snapshot so rescheduling does not suppress the reminder at the new time. The worker rechecks attendance inside its account write lock before enqueueing.

Reminders respect enabled preferences, quiet hours, snooze, notification caps and active focus. Routine reminders use no OpenAI generation. Email/push still require the existing delivery configuration and learner opt-in. Attendance does not bypass the app's shared monthly AI cap.

Attendance is available from 30 minutes before the session until 24 hours after its end. All comparisons use real instants; displays use the learner's existing timezone. UI labels remain English.

## Security and persistence

- Authenticated learner-only attendance reads; origin-validated, schema-validated writes.
- Account write locks, ownership checks, stale snapshot rejection, idempotent attendance and skip actions.
- Composite block/account foreign key, unique account/block/date identity and constrained status values.
- An active timer cannot be skipped or rebound to a moved snapshot through attendance reporting.
- Migration `0010_study_attendance.sql` adds the attendance table and nullable timer link without changing existing study records. Applied to the configured database. Run `npm run db:migrate` when deploying against a different database.

## Verification

- Four pure attendance tests: exact occurrence matching, stale moved snapshots, reported versus missing attendance, and attendance time boundaries.
- Six disposable real-database tests: atomic Attend/Finish and saved session linkage; ownership, stale and early requests; skip preservation and reminder suppression/deduplication; notification Skip; weekly occurrence moved a week away; title-only block linked to the chosen subject with discard preserving attendance.
- Existing overlapping-worker missed-reminder regression passed with the new snapshot key.
- Browser checks against an isolated production build: dashboard Attend, floating Finish without navigation, automatic next session, scheduled study dropdown with subject/topic selection, planner attendance/Continue, and mobile layout without overflow or runtime errors. Additional checks cover title-only Attend with a manually chosen subject and failed attendance reads.
- A genuine OpenAI chat read the owned calendar/attendance tools and correctly identified the completed and attended sessions. Actual ledger cost: $0.0087.
- TypeScript, ESLint, unit/analytics tests, Drizzle consistency and production build passed.

Run `npm run test:aven` to include the real-database attendance suite using disposable fixtures. It creates and cleans up its own records. Provider verification is separate and uses the configured monthly budget.

Deploy the current code to Vercel to enable these changes live. Keep the existing secured five-minute `/api/cron/aven` job and enable study/missed-session reminders in Aven preferences.
