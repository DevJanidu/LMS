# Aven Adaptive Learning & Goal Intelligence

How Aven connects what a learner intends, plans, does and achieves. It builds on the
existing companion (see [AVEN_AGENT_ARCHITECTURE.md](AVEN_AGENT_ARCHITECTURE.md) and
[AVEN_PROACTIVE_COMPANION.md](AVEN_PROACTIVE_COMPANION.md)). It is not a separate chatbot.

## 1. Architecture

```
src/lib/learning/
  signals.ts      self-reported difficulty/confidence (pure)
  coverage.ts     topic coverage audit (pure)
  goal-health.ts  explainable goal health (pure)
  gaps.ts         missed / neglected / mis-prioritized work, with severity (pure)
  practice.ts     adaptive practice scheduling (pure)
  server.ts       account-scoped loaders shared by Aven tools, the scheduler and routes
```

Layer A (deterministic, no model calls): the pure modules above, fed by indexed,
user-scoped queries in `server.ts`. Layer B (AI): Aven reads Layer A results through tools
and explains them. Routine alerts use templates and cost no tokens.

Every surface uses the same services:

| Surface | Uses |
|---|---|
| Aven tools `auditTopicCoverage`, `getGoalHealth`, `getLearningGaps` | `loadTopicCoverage`, `loadGoalHealth`, `loadLearningGaps` |
| Aven tool `proposePracticeSessions` | `planSubjectPractice` → existing `schedule` proposal → existing approval path |
| Aven tool `recordLearningSignal` | `learningSignal` proposal → `saveLearningSignal` on approval |
| Next Best Action (dashboard, goals pages, Aven) | `rankNextActions` + `learningRankingContext` |
| Proactive scheduler (`learningAlert`) | `loadLearningGaps`, `planSubjectPractice`, existing notification pipeline |
| After-session confidence check, Aven settings | `POST/GET /api/learning/signals` → `saveLearningSignal` |

## 2. Database schema

**No migration.** Like earlier Aven releases, new state lives in existing columns, so this
release can ship without a production migration step:

- `ai_user_preferences.value.learningSignals`: at most 60 `{subjectId, topicId, level,
  source, at}` entries. The schema uses `.catch([])`, so a malformed entry never breaks
  preferences. The settings form can't overwrite it; the server preserves the stored list.
- `ai_plan_proposals.value.recommendationKey` (optional, in the existing JSON column)
  identifies a recommendation (`practice:<subjectId>`, `recovery:<goalId>`). A rejected
  proposal with that key quiets the suggestion for 14 days.
- New proposal kind `learningSignal` uses the existing text/JSON columns.
- Postponements come from existing records: `schedule_exceptions` moved to a later day, and
  `schedule_attendance` rows with status `skipped`.

## 3. Topic coverage rules (`coverage.ts`)

Input: subject ID, user (from authentication), optional goal ID, optional window (default:
60 days back to 28 days ahead). All counts come from database rows.

| Fact | Rule |
|---|---|
| Required | Non-archived topics of the subject |
| Completed | `topics.status = completed` (marked by the learner) |
| Planned | A calendar occurrence for the topic in the window, or a goal task for it linked to a session |
| Studied | Valid study sessions on the topic (all time), or status not `not_started` |
| Overdue | Not completed and `target_date` before today (account timezone) |
| Never scheduled | Not completed and not planned |
| Planned but not completed | Past sessions on the topic, topic still open |
| Repeatedly postponed | 2+ postponements in the window |
| Prerequisite gap | An active goal task on the topic is blocked by unfinished prerequisite tasks or milestones |
| Mastery | Never computed. There are no assessment records. The audit returns `mastery.measured = false`; confidence is shown as `selfReportedConfidence` |

## 4. Goal health rules (`goal-health.ts`)

Status is **atRisk** if any of:
- `pastTarget`: target date passed with open tasks
- `capacityShortfall`: remaining minutes > available minutes
- `overdueBlocksUpcoming`: an overdue task is a prerequisite (directly, or as the last open
  task of a prerequisite milestone) of open work due within 7 days

Otherwise **needsAttention** if any of:
- `overdueMilestone`: a milestone is past due and incomplete
- `overdueTasks`
- `tightCapacity`: remaining > 75% of available
- `allBlocked`
- `noRecentProgress`: the goal started 7+ days ago and has had no study, activity or
  completion in 7 days

Otherwise **onTrack**.

- Remaining minutes = Σ estimated minutes × (1 − task progress) over open tasks.
- Available minutes = daily target × the learner's study days from today to the target.
- Trend compares current progress with the latest daily snapshot at least 7 days old
  (`unknown` without one).

Each reason carries its facts, for example: "needsAttention: overdueMilestone 'Complete SQL
Foundations', due 2026-10-09, 2 open tasks". This is computed on demand from data already
loaded; it never calls a model. The existing percentage-based badge on goal cards is
unchanged.

## 5. Gap detection and severity (`gaps.ts`)

| Severity | Findings |
|---|---|
| critical | `overduePrerequisite`: an overdue prerequisite blocks work due within 7 days |
| high | `pastTarget`; `overdueMilestone` with 2+ open tasks; `priorityMismatch` when the neglected task is a prerequisite |
| medium | `overdueMilestone` with 1 open task; `overdueTask`; `postponedTopic` (2+ in 30 days); `missedSessions` (2+ of one subject this week, no attendance and no same-subject study during the slot); `reportedDifficulty` (needs practice, open topics, nothing planned); `priorityMismatch` (non-prerequisite); `inactiveGoal` due within 14 days |
| low | `inactiveGoal` with no deadline in the next 14 days |

`priorityMismatch` needs evidence: 60+ verified minutes on one subject this week while an
overdue task on another subject received no study time. A prerequisite is called one only
when goal dependencies say so.

Each finding has a **fingerprint** that changes only when its facts change, for example
`postponed:<topic>:<count>` or `prerequisite:<task>:<due>`.

## 6. Prioritization

The Next Best Action ranking (`goals/next-action.ts`) keeps its deterministic scoring and
adds two evidence-backed reasons:

- `reportedDifficulty`: +8 for needs practice, +4 for getting there
- `postponed`: +6 when a task's topic was postponed 2+ times

Reasons are shown on the dashboard and goal cards ("You said this subject needs more
practice.", "It has been postponed 2 times recently."). Learners can override any
recommendation by declining it.

## 7. Adaptive scheduling (`practice.ts`)

Topics are chosen in this order, each with a stated reason:
1. reported difficulty
2. postponed 2+ times
3. overdue
4. planned but unfinished
5. never scheduled
6. remaining open topics without a session

If every topic is complete and difficulty persists, Aven proposes **review** sessions
(completion is not mastery). Topics whose goal tasks wait on prerequisites are skipped and
listed.

Slot rules:
- preferred study hours on study days, in the account timezone
- 15-minute buffer around existing commitments
- no overlaps
- each day stays within the daily target, with at most one practice session per day
- a 30-minute lead time
- horizon of 14 days or less

If time runs out, the result reports the `shortfall`, the binding `constraint`
(`noFreeTime` or `dailyTarget`) and up to 3 sessions on other subjects that could move.
Those are suggestions only; nothing is deleted or moved silently.

The output is a standard `schedule` proposal. On approval, the existing path re-validates
overlap and the daily target in a transaction, creates the sessions, then **reads them back**
and fails with `persistenceUnavailable` if any is missing. Session reminders follow
automatically, because the scheduler derives them from calendar sessions.

Declining: rejected proposals with a `recommendationKey` stop the tool from proposing the
same practice for 14 days unless the student asks again (`explicitRequest`). The scheduler
also stops attaching drafts.

## 8. Long-term learning signals (`signals.ts`)

- Sources:
  - `chat`: only through an approved `learningSignal` proposal
  - `checkIn`: the optional "How confident do you feel?" question when a timer session is
    saved (Need more practice, Getting there, Confident, Skip)
- The latest report for a subject or topic replaces the earlier one. Reports older than 60
  days stop counting, so nothing is labeled permanently.
- A "needs practice" report eases to "getting there" after 3 topics are completed following
  it; a later "confident" report ends extra-practice planning.
- Learners see and remove reports in **Aven settings → Learning check-ins**.

## 9. Proactive accountability (`scheduler.ts`, `learningAlert`)

- Evaluated once a day, 150 minutes after the morning time (15-minute catch-up window). It
  is skipped on days with a goal alert, and at most one is sent per day.
- Alertable findings: `overduePrerequisite`, `priorityMismatch`, `postponedTopic`,
  `missedSessions`, `reportedDifficulty`, `overdueTask`. Findings must be medium severity
  or higher and must not belong to a goal with reminders turned off.
- Dedup key: `learningAlert:<fingerprint>`. The same unchanged state is announced once.
- When possible a private draft is attached:
  - task findings: the existing goal catch-up planner
  - subject findings: one 45-minute practice slot ("I've found a free 45-minute slot on
    Thursday at 18:15 for Concurrency. Want me to use it?")

  Neither is attached when the learner declined it recently.
- Delivery uses the existing pipeline: notification preferences, `goalReminders` toggle,
  quiet hours, snooze, daily limit, timezone, in-app/push/email channels, Resend with
  idempotency keys, retries and `notification_deliveries` status. No model call.

## 10. Test results

Commands: `npm run typecheck`, `npm run lint`, `npm test`.

- Typecheck and lint: clean.
- `npm test`: **467 passed, 67 skipped, 0 failed** (58 files passed, 10 skipped). The 40
  new tests are in `tests/learning-intelligence.test.ts`, `tests/learning-tools.test.ts`
  and `tests/learning-performance.test.ts`.

| Scenario | Covered by |
|---|---|
| 1 Struggling with a subject | Reported topic first; 3 sessions on distinct days in study hours; no overlap with existing sessions; passes the approval-time `validateSchedule`; valid proposal with recommendation key; blocked topics skipped |
| 2 Missing topics | 35/24/11 counts; overdue, never-scheduled, planned-not-completed and postponed classification; prerequisite gaps; `mastery.measured = false` |
| 3 Overdue milestone | `overdueMilestone` with 2 open tasks → needsAttention / high; prerequisite blocking work due in 4 days → atRisk / critical; capacity shortfall with both figures |
| 4 Wrong priority | 180 min on Spring Boot while the SQL prerequisite is overdue → `priorityMismatch` high; no finding under 60 min; NBA ranks the prerequisite first; difficulty and postponement reasons |
| 5 Proactive notification | Stable fingerprints until facts change; `goalReminders` gates `learningAlert`; low-severity inactivity is not urgent |
| 6 Declined recommendation | Tool returns `declinedRecently` with no plan or proposal; an explicit request still works |
| 7 No available time | No sessions, `shortfall: 3`, `noFreeTime`; trade-offs listed, commitments untouched; `dailyTarget` constraint detected; the tool creates no proposal |
| 8 Long-term improvement | Improvement after 3 completions; a confident report replaces the earlier one and ends practice; 60-day expiry; bounded store; malformed data tolerated |

`tests/learning.integration.test.ts` runs Scenarios 1, 5, 6 and 8 and the ownership checks
against a real database:
- approve → blocks read back
- reject → no blocks and `recentlyDeclined`
- `processAvenUser` sends exactly one alert, with in-app `delivered` and email `pending`

It only runs with `TEST_DATABASE_URL`, the same as the existing integration suites. **It
has not been executed yet**: the CI database job's Neon/Upstash variables aren't configured
in this repository.

## 11. Security and performance

- Every loader filters by the authenticated user ID. Subjects and topics are
  ownership-checked before signals are written. All SQL is parameterized.
- The route requires an onboarded learner, checks the same origin and caps the body size.
  Aven tools stay read-only or proposal-only.
- No new indexes are needed:
  - postponements use `schedule_blocks(user_id, …)` and the exception `(block_id, date)` key
  - study totals use `study_sessions_subject_idx`
  - declines use `ai_proposals_owner_status_idx`
- Measured engine cost (`learning-performance.test.ts`, 2,000 synthetic learners × 5 goals
  × 20 tasks × 35 topics, no DB, no model): **about 1.3 ms CPU per learner** on the
  development machine.
- Proactive scans run at most a few times per learner per day, inside the existing claimed,
  batched and time-budgeted scheduler.
- Database latency at scale has **not** been measured. This change makes no claim of
  one-million-user readiness.

## 12. Remaining limitations

- Moving a **one-off** session overwrites its time without history, so only recurring
  sessions moved to a later day and skipped attendance count as postponements. Counting
  every move needs a schedule-change history table (a migration).
- There are no assessments or quizzes, so mastery is never computed. Confidence is
  self-reported.
- Goal cards still show the percentage-based badge. The explainable reasons are available
  to Aven and alerts, but goal pages don't display them yet.
- The integration suite and live email delivery for this feature are unverified until the
  CI database secrets are configured and a learner opts in to email.
- Alert copy uses English templates (the product is English-only).
