# Aven Proactive Companion (Master Prompt 3)

## 1. Audit of existing infrastructure (2026-10-12)

| Component | Finding |
|-----------|---------|
| `GET /api/cron/aven` | Bearer `CRON_SECRET` (≥ 32 chars, constant-time comparison). Production returns **401** without credentials. |
| Scheduler trigger | **Running in production.** Check-ins of every kind (morning, session, missed, evening, weekly, check-in, recovery) were created today, and `next_check_at` advances every ~5 minutes. The trigger is an external scheduler configured outside this repository; `vercel.json` has no Aven entry, because Vercel Hobby only allows daily crons. |
| `scheduler.ts` | Per-user claiming (`FOR UPDATE SKIP LOCKED`, `next_check_at`), account row lock per run, dedup through `scheduled_check_ins` and `notifications` unique keys, quiet hours, daily caps, snooze, active-timer suppression, 60-minute catch-up for daily messages. Deterministic, no OpenAI calls. |
| `delivery.ts` | Leased worker; in-app delivered immediately; push (RFC 8291/VAPID, platform crypto) and email (Resend with idempotency key); exponential retry up to 8 attempts; delivery cancelled when a preference is withdrawn; quiet hours and snooze postpone instead of drop. |
| Proactive conversations | Every reminder is appended to one "companion" conversation with a context snapshot; replies carry the notification id into chat. |
| Attendance | Explicit attended/completed/skipped reports suppress reminders. |
| Production data | 2 learners with reminder preferences (both enabled, both AI-consented); 9 in-app deliveries; **0 push subscriptions; no email deliveries**. Push and email have never been exercised in production. |

What was missing:
- briefings were counts only, with no next step
- check-ins could fall back to a generic message and repeat the same template
- no goal monitoring beyond "due within 3 days"
- no recovery drafts
- missed-session detection ignored study recorded during the slot
- the scheduler handled at most 12 users per run, so it could not keep up with many users
- onboarding mixed the separate consents together
- `scheduled_check_ins` was never pruned

## 2. Implemented

### Daily lifecycle (deterministic)
- **Morning briefing**: today's first session and time, how many more are
  planned, tasks due today or this week, and the Next Best Action ("Want to
  focus on …?").
- **Before-session reminder**: unchanged (lead time configurable).
- **Missed session**: suppressed when attendance is reported, a timer is
  running, or verified same-subject study started during the slot (this
  suppresses the reminder; it never marks attendance). The copy no longer
  asserts the learner didn't study: "I haven't seen your … session start yet.
  Want to begin now, move it, or skip it?" Start, Reschedule, Snooze and Skip
  appear in chat and in the notification center.
- **Evening reflection**: unchanged.
- **Weekly review**: recorded hours and sessions, a comparison with last week
  (only when last week has records), completed tasks, planned sessions with no
  attendance recorded, deadlines in the next 7 days, and a recommended next
  task.

### Contextual check-ins (`companion-model.ts`)
Once a day at a stable random time inside the allowed window. The message
picks the most useful option it didn't use last time:
1. a fitting task before the next planned session ("If you have time before
   then…"; free time is never assumed)
2. an approaching deadline
3. progress already recorded today
4. the upcoming session
5. the next recommended task

When there is no verified context, no check-in is sent. The existing rules
still apply: no check-in during active study, none within an hour of another
Aven message, and quiet hours and daily caps hold.

### Goal monitoring (`goal-monitor.ts`)
Detects, from records only:
- a deadline within 7 days with open tasks
- a missed milestone
- an at-risk or overdue goal
- all remaining work blocked by prerequisites
- no recorded progress for 7 days

At most one goal alert per day, and the same goal and kind repeat at most once
a week. Alerts are sent 90 minutes after the morning time so they never compete
with the briefing.

### Adaptive recovery
When an alerted goal has unblocked work, the scheduler runs the existing
deterministic planner (`proposeAdaptiveSchedule`). The planner respects
prerequisites, preferred hours, the daily target and existing commitments. Its
result is saved as a **private pending proposal** in the companion
conversation, in the same transaction as the message. Nothing changes until the
learner approves. Aven's instructions tell it to refer to that draft rather than
create a duplicate, and the "recovery" intent routes catch-up requests to the
planning model.

### Coaching
- Coaching style (supportive, direct, analytical) is applied explicitly in chat.
- Encouragement must cite verified accomplishments; there is no generic praise
  and no guilt.
- `getWeeklyAnalytics` returns the previous week with a `comparable` flag, so
  "one more session than last week" is only said when it's backed by records.

### Onboarding (one time)
Separate, revocable choices, each explained:
- AI processing consent (required)
- in-app proactive reminders
- browser push (permission requested only if chosen)
- email (offered only when configured)
- resource-content access

It also explains how reminders work, quiet hours and the daily limit, and how to
change, pause or turn everything off. After setup, chat works without
re-activation.

### Scheduler scale
Batches of 8 users are processed concurrently and claimed repeatedly until a
35-second budget is used (`maxDuration` 60 s). The response reports
`remaining: true` when work is left. Each user is isolated: a failure is
retried a minute later and never blocks others. Daily messages already sent
today are not rebuilt on later runs.

## 3. Autonomy policy

| Aven does automatically | Aven asks for approval |
|---|---|
| Read the learner's own permitted records | Change, create or cancel study sessions |
| Detect deadlines, missed attendance and inactivity | Create recurring commitments |
| Send enabled reminders, briefings and reviews | Create or edit goals, tasks or deadlines |
| Rank the next best action | Change preferences or memory |
| Save private draft plans as pending proposals | Delete anything |

Pre-authorized actions are limited to what the learner triggers from a
reminder: Start, Snooze, Skip and Reschedule, each scoped to that notification's
own session. Aven has no unrestricted database access; every tool is
account-scoped and validated.

## 4. Scheduler configuration

The external scheduler must call, every 5 minutes:

```
GET https://<APP_URL>/api/cron/aven
Authorization: Bearer <CRON_SECRET>
```

- The secret must be at least 32 characters.
- A 200 response with `"remaining": true` means more users are due. Call again
  immediately; this is optional, and the next run catches up anyway.
- Runs are idempotent and safe to overlap (row claims and dedup keys).

Equivalent options:
- **Current setup**: an external cron service (already active).
- **Vercel Pro**: add `{ "path": "/api/cron/aven", "schedule": "*/5 * * * *" }`
  to `vercel.json`. Vercel sends `Authorization: Bearer $CRON_SECRET`
  automatically. Don't add this on Hobby, which rejects sub-daily crons.
- **GitHub Actions** (best-effort timing):
  ```yaml
  on: { schedule: [{ cron: "*/5 * * * *" }], workflow_dispatch: {} }
  jobs:
    aven:
      runs-on: ubuntu-latest
      steps:
        - run: curl -fsS -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/aven"
          env: { CRON_SECRET: "${{ secrets.CRON_SECRET }}", APP_URL: "${{ secrets.APP_URL }}" }
  ```

Use one trigger only. A second one is harmless, but it adds load.

## 5. Notification channels

| Channel | Configuration | Verified |
|---|---|---|
| In-app | always | ✅ 9 production deliveries |
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | ✅ key valid, `acadence.janidudev.com` verified (read-only API check). ⚠️ No email has been sent: no learner has opted in yet. |
| Browser push | `VAPID_PUBLIC_KEY` (65 bytes), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`) | ✅ keys well-formed; RFC 8291 encryption covered by tests. ⚠️ No subscriptions exist, so push has never been sent. |

A delivery is marked `delivered` only after the provider acknowledges it; a
notification record alone doesn't count.

## 6. Database changes

None. New behavior uses existing tables:
- `scheduled_check_ins.value.template` stores the check-in variant
- goal alerts use the `goalAlert` kind
- drafts are `ai_plan_proposals` rows

Retention now also prunes non-pending `scheduled_check_ins` older than 90 days,
matching notifications.

## 7. SaaS readiness
- Per-user timezone in every calculation; no user IDs are hard-coded.
- Per-user, daily and global AI budgets and rate limits are unchanged.
- Routine reminders cost no AI tokens.
- Not implemented: subscription-tier quotas (there is no subscription model
  yet). Budgets are environment-wide per user; `reserveUsage` is the single
  place to add plan-based limits.

## 8. Remaining limitations
- End-to-end push and email delivery are unverified until a learner subscribes
  or opts in. Suggested check: opt in your own account, then confirm a
  `delivered` row in `notification_deliveries`.
- Check-ins and briefings use fixed English templates rather than
  AI-personalized language. That's deliberate: it keeps them predictable and
  free.
- Recovery drafts expire after 24 hours like other proposals; the next weekly
  alert creates a fresh one.
