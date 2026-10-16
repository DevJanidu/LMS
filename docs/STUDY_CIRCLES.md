# Study Circles

Friends, private study groups and weekly leaderboards built on **verified** study time.
Tagline: *Learn together. Stay consistent. Grow together.*

## Architecture

| Layer | Files |
| --- | --- |
| Rules (pure, unit-tested) | `src/lib/circles/policy.ts` |
| Verified time (timer hooks, heartbeats, ledger) | `src/lib/circles/tracking.ts`, timer cases in `src/lib/services/mutations.ts` |
| Social graph, groups, privacy | `src/lib/circles/social.ts` |
| Read models (leaderboards, feed, history) | `src/lib/circles/leaderboard.ts` |
| Finalization, corrections, reconciliation | `src/lib/circles/competition.ts` |
| Aven tool | `src/lib/circles/assistant.ts` (`getStudyCircles`) |
| HTTP | `src/app/api/circles`, `src/app/api/study/heartbeat`, `src/app/api/cron/circles`, `src/app/api/admin/circles` |
| UI | `src/app/[locale]/(learner)/circles/**`, `src/components/circles/**`, `src/app/circles.css` |
| Schema | `src/lib/db/schema-circles.ts`, migration `drizzle/0012_study_circles.sql` |

PostgreSQL is the only authoritative store. Upstash Redis is used only for rate limits.

## Verified time

The existing timer was already server-authoritative: the browser sends commands
(`start`, `pause`, `resume`, `confirm`, `finish`, `discard`), every timestamp is the
server clock, and a user can have only one active timer (primary key on `user_id`).
Study Circles adds:

1. **Server-observed spans** (`study_timer_segments`). `start`/`resume`/`confirm` open a
   span, `pause`/`finish`/`discard` close it. At most one open span per user (partial
   unique index).
2. **Heartbeats** (`POST /api/study/heartbeat`, once a minute while the timer runs). A
   heartbeat proves the client is connected, **not** that the student is paying
   attention. It carries no data. A span earns credit only up to its last heartbeat
   plus 90 s; after a silence longer than 180 s a new span starts, so the gap earns nothing.
3. **An append-only ledger** (`verified_study_intervals`) written in the same
   transaction as `finish`, one piece per competition day. Pieces are keyed by
   `(user, timer start, piece start)`, so replayed or concurrent finishes add nothing.
   Time already credited is subtracted first; a GiST exclusion constraint is the backstop
   against overlapping credit.
4. **Weekly scores** (`weekly_scores`), an incremental projection updated in the same
   transaction; `reconcileWeeklyScores` rebuilds it from the ledger.

Manual sessions (`source = 'manual'`, including any edited timer session) stay in personal
analytics and are listed in History as "not counted". They never enter the ledger.

### Scoring rules (published in the app under "How scoring works")

- Competition timezone **Asia/Colombo**; weeks are Monday 00:00 to the next Monday 00:00
  (half-open), stored in UTC. Sessions crossing midnight are split by day and week.
- At most **4 h per session** and **10 h per day** are credited; the excess is recorded
  with a reason (`sessionCap`, `dailyCap`). Sessions under one minute are not credited.
- **Ties** use standard competition ranking: equal time shares a rank and the next rank
  skips (1, 1, 3). Display order inside a tie is by name, then user id, never by database
  order. Every tied first place with time is a winner.
- A week is **finalized** at the first daily cron run at least 24 h after it ends
  (`/api/cron/circles`, 19:00 UTC). Finalization is claimed with a conditional update, so
  it happens once; group standings are frozen in `group_week_results` with the roster at
  that moment. Credit that arrives later is recorded as `weekFinalized` and not counted.
- After finalization, results change only through `correctInterval` (platform
  administrators): it records actor, reason and before/after credit in `score_adjustments`
  and `audit_logs`, adjusts weekly scores, re-ranks affected groups and marks them corrected.

## Privacy and authorization

All rules are enforced on the server.

- **Friend requests are privacy-preserving.** Every attempt is stored as a
  `friend_invitations` row showing only a masked email to the sender, and the response is
  always "If this person can receive friend requests, they'll get yours". No caller can
  tell whether an address has an account, does not accept requests, has blocked them, is
  already a friend or already has a pending request. Only self-requests and the sender's
  own limits are reported.
- One pending request per pair (either direction) and one friendship row per pair are
  enforced by unique indexes. Only the recipient can accept or decline; anyone else gets 404.
- **Blocks** override everything: they remove the friendship and cancel pending requests and
  group invitations both ways, and blocked users cannot reach each other again.
- **Visibility** (`social_profiles`): activity and daily history are `private`, `friends`
  or `groups` (friends plus group co-members). Subject names are hidden unless
  `shareSubjects` is on ("completed a 45-minute study session"). Streaks and friends'
  leaderboard appearances can be turned off. Emails, notes, goals, files and calendars are
  never shared, and there is no live presence.
- **Groups**: invitations require acceptance; owners and admins can invite only their own
  friends; admins manage members only; nobody can self-promote to owner. Non-members get
  404 for every group view, including the page itself. Joining a group shares your weekly
  verified total with its members.
- Rate limits per user: requests 10/h, invitations 20/h, group creation 10/day, heartbeats 6/min.

## Aven

`getStudyCircles` is a read-only tool with no arguments. It is built from the same
privacy-filtered functions as the UI (`friendsLeaderboard`, `groupLeaderboard`), so a
model cannot name another user or reach their sessions or subjects. Aven's instructions
treat friend and group names as untrusted data, quote gaps exactly, and never encourage
sacrificing sleep, meals or health to win.

## Scale notes

Reads are indexed lookups by user or group (`weekly_scores` primary key, friendship
indexes, `verified_study_intervals (user_id, week_start)`). Leaderboards read the weekly
projection, never the ledger. The UI polls the current week every 60 s while visible
(no sockets). Friends are capped at 500, groups per user at 20 and members per group at 50
(`LIMITS` in `policy.ts`). Finalization iterates groups once a week in a single
transaction; at very large group counts it should move to batched transactions.

## Operations

- Apply `drizzle/0012_study_circles.sql` (requires the `btree_gist` extension, created by
  the migration) with `npm run db:migrate` on each environment.
- Corrections: `POST /api/admin/circles {"kind":"correct","intervalId","action":"invalidate"|"restore","reason"}`.
  Reconciliation: `{"kind":"reconcile","userId"}`.
- Retention removes closed timer spans after 30 days; the ledger is kept.
