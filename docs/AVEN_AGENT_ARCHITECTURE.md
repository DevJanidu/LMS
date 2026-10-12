# Aven Agent Architecture (Master Prompt 2)

How Aven turns natural-language requests into reviewed LMS changes, the gaps
found before this upgrade, and what changed.

## Request flow

```
POST /api/aven/chat
  prepareChat        auth → consent → classifyIntent → reserveUsage(budget, rate limit)
                     → beginConversationTurn (lease, history) → active-goal summary
  streamChat         bounded loop (MAX_TOOL_ROUNDS = 6)
    Responses API    model + reasoning.effort + max_output_tokens, store:false, stream
    tool calls       validateToolInput (strict zod) → account-scoped executor
      read tools     run immediately (goals, calendar, history, next best action…)
      write tools    storeProposal only → approval card; never mutate
    reply guard      unapproved-change claims are corrected before display
  finishConversationTurn / finishUsage (actual tokens, or conservative reservation)
POST /api/aven/proposals   resolveProposal: row lock → validate → transactional apply → verify
```

## Gaps found

| Area | State before | Gap |
|------|--------------|-----|
| Model | `gpt-4.1-mini`, 4,096 output tokens, no reasoning settings | GPT-6 Luna is a reasoning model: reasoning tokens count toward `max_output_tokens`, effort must be configurable, incomplete responses were reported as generic outages. |
| Intent | Client flag decided the planning model | No server-side understanding of goal, schedule or move requests. |
| Goals | `proposeGoal` (title + date) or `proposeGoalPlan` (full raw schema) | The model had to fill every goal field; no derived deadlines, capacity check, subject matching or duplicate protection. Repeated proposals could create duplicate goals. |
| Schedules | `createStudySchedule` once/weekly; overlaps rejected only at approval | No "daily", no subject-name resolution, no conflict preview, no way to skip conflicting dates. |
| Moves | Always single occurrence | No "this and future" or "entire series"; the series could not be edited conversationally. |
| Next action | Per-goal `nextTaskId` (priority, due date) | No cross-goal ranking, no reasons, and it wasn't available to Aven. |
| Reliability | One retry for 429 | 5xx not retried; output-budget exhaustion not classified. |

Already sound and kept: the hierarchy model (goal → milestones → tasks → study
sessions via `goalScheduleLinks`), proposal/approval with row locks and undo,
budgets (per-user, global, token, rate), ownership checks in every tool,
audit logs, conversation persistence, and AI memory with inspect/edit/delete.

## Changes

### Model configuration (`configuration.ts`, `config.ts`, `chat.ts`)
- Default `OPENAI_CHAT_MODEL` / `OPENAI_PLANNING_MODEL`: **`gpt-6-luna`**, which
  was checked against OpenAI's model page on 2026-10-12. It supports the
  Responses API, streaming, function calling and structured outputs, costs
  $0.10 per 1M input / $0.50 per 1M output tokens, and has a 1.05M-token
  context with 128K maximum output. The production key returned HTTP 200 for
  `GET /v1/models/gpt-6-luna`.
- `OPENAI_CHAT_REASONING_EFFORT` (default `low`) and
  `OPENAI_PLANNING_REASONING_EFFORT` (default `medium`) are sent only to
  reasoning models.
- Output budget per request: 12,000 tokens for chat and 25,000 for planning on
  reasoning models, 4,096 otherwise, or `AVEN_MAX_OUTPUT_TOKENS`. Budget
  reservations use the same figure.
- Reasoning items from earlier tool rounds are passed back statelessly (they
  carry encrypted content with `store:false`). They are excluded from the
  context byte budget, because the output-token budget already caps them.
- An incomplete response caused by `max_output_tokens` is reported as
  `aiOutputLimit`. 5xx and 429 responses get one retry before any streaming
  starts.
- Supported fallback: set both models to `gpt-4.1-mini` with prices 0.40 / 1.60.

### Intent classification (`intent.ts`)
Deterministic patterns detect goal, schedule, reschedule, progress, next-action
and learning intents, plus multi-part requests. A match switches the turn to the
planning model and adds focused per-turn guidance. It doesn't remove tools; the
model still chooses.

### Goal decomposition (`decomposition.ts`, tool `proposeGoalHierarchy`)
The model fills a strict function schema (structured output): the primary
outcome, deadline, ordered milestones with dependencies, estimated hours,
subject names, tasks, and its assumptions. The server then:
- rejects forward or circular dependencies and past deadlines,
- suggests milestone and task deadlines from cumulative effort, never before a
  prerequisite's deadline,
- matches subject names to the learner's own subjects,
- compares total effort with the learner's daily target and study days, and
  reports recent verified weekly study hours,
- names the first unblocked task,
- labels suggestions, verified figures and assumptions separately in the
  explanation,
- returns existing similar goals (word-overlap similarity ≥ 0.6) instead of a
  proposal unless the student confirmed a separate goal (`allowDuplicate`) or
  asked to extend one (`goalId`).

The result is a standard `goalPlan` proposal, applied transactionally by the
existing approval path.

### Duplicate and retry safety (`proposals.ts`)
- A revised plan for the same goal in the same conversation marks the earlier
  pending proposal `superseded`, so only one can be approved ("Edit plan").
- Approval rejects a new goal whose title duplicates an existing open goal
  (`duplicateGoal`).
- Repeated approval returns the stored result (existing row lock).
- After saving, the transaction verifies every milestone and task exists before
  reporting success.

### Natural-language scheduling (`calendar-actions.ts`, `createStudySchedule`)
- `repeat: "daily"` is stored as one weekly series with all seven weekdays
  (one row, no duplicates). `subjectName` is resolved server-side.
- Every occurrence within the range (or up to a year) is checked against
  existing commitments before a proposal exists. With conflicts, the tool
  returns them to the model instead of proposing.
- After the student agrees (`skipConflicts: true`), conflicting dates become
  cancelled exceptions on the new series. The card lists what was skipped and
  why.

### Schedule modification (`moveStudySessions`)
- Each move carries `scope`: `one`, `future` or `all`. One-off sessions are
  always `one`. Instructions and turn guidance tell Aven to ask when a recurring
  session's scope is unclear and never to widen it silently.
- Approval checks every resulting occurrence of a series move, up to one year
  ahead, against other commitments. It reuses the calendar's existing
  `applyCalendarCommand` recurrence logic.
- Cards label the scope and the number of affected occurrences. Undo stays
  limited to single-occurrence moves.

### Next Best Action (`goals/next-action.ts`, `goals/next-action-server.ts`)
Deterministic scoring from recorded facts only:

- deadline: overdue, due within 2, 7 or 14 days
- goal and task priority
- the number of tasks it unblocks, including later milestones when it is the
  last open task of a milestone
- work already started
- recent study on the goal
- whether the goal is at risk
- fit with the daily target

Blocked, finished and inactive work is never recommended. The engine returns
reason codes rather than prose. It is exposed in:
- Aven: the `getNextBestAction` tool, plus a validated card persisted with the
  reply
- the Goals dashboard
- the goal detail page
- the main dashboard (via `GoalPriorities`)

### Memory and context
The LMS database stays the source of truth. Each turn receives only the titles
and due dates of up to five active goals, the latest five memory excerpts, and
the conversation summary; full records come from tools on demand. Memory
editing and deletion are unchanged (Aven settings).

## Database migrations

None. Hierarchy, recurrence exceptions and series splits reuse existing tables.
New proposal fields (`allowDuplicate`, `scope`, `affected`, `skipDates`,
`occurrences`, `conflicts`) live in the existing JSON column with defaults, so
stored proposals still parse. The `superseded` status uses the existing text
column.

## Durable job state

Not added. Each turn is bounded (6 provider rounds, 110 s timeout, a 130 s
conversation lease), and the durable artifacts are already persisted: messages,
proposals, approvals and audit logs. Long-running background agents are out of
scope.

## Remaining deployment requirements

- Set the same model and price variables in the hosting provider (for example
  Vercel). Local `.env.local` and `.env.production` were updated.
- Run `npm run test:aven` against a disposable database to execute the
  integration suites.
- Optional: `node scripts/check-aven.mjs --env=.env.production --connections`
  re-verifies model access (read-only, no tokens).
