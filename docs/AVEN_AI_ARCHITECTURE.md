# Aven AI architecture

This is the current implemented architecture of the Aven study companion. Section 9 lists
proposals that are **not** implemented. Related documents:

- [AVEN_AI_COMMANDS.md](AVEN_AI_COMMANDS.md)
- [AVEN_AI_TOOL_REGISTRY.md](AVEN_AI_TOOL_REGISTRY.md)
- [AVEN_AI_SECURITY.md](AVEN_AI_SECURITY.md)
- [AVEN_AI_TEST_REPORT.md](AVEN_AI_TEST_REPORT.md)
- [AVEN_AI_SCALING_PLAN.md](AVEN_AI_SCALING_PLAN.md)

Earlier design notes are kept for history:

- [AVEN_AGENT_ARCHITECTURE.md](AVEN_AGENT_ARCHITECTURE.md)
- [AVEN_PROACTIVE_COMPANION.md](AVEN_PROACTIVE_COMPANION.md)
- [AVEN_LEARNING_INTELLIGENCE.md](AVEN_LEARNING_INTELLIGENCE.md)
- [AVEN_MENTIONS_COMMANDS.md](AVEN_MENTIONS_COMMANDS.md)

## 1. Stack (verified in the repository)

- **App:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4,
  next-intl (English only).
- **Data:** Neon Postgres through Drizzle (`@neondatabase/serverless` Pool), with
  migrations in `drizzle/`. Upstash Redis handles rate limits and caching.
- **Accounts:** Better Auth, Google sign-in only.
- **AI:** OpenAI Responses API through `fetch`, streamed, with `store: false`.
- **Model:** `OPENAI_CHAT_MODEL` and `OPENAI_PLANNING_MODEL`. The repository default is
  `gpt-6-luna`, set in `src/lib/aven/configuration.ts`. The deployed value is whatever the
  environment sets; this work didn't read production secrets. The UI name "GPT Luna" is
  only a label, and nothing in the code depends on it.
- **Email:** Resend, with idempotency keys. **Push:** VAPID and RFC 8291.
- **Background work:** an external scheduler calls `/api/cron/aven` every 5 minutes, and
  Vercel daily crons handle reminders, timers, storage, retention and circles.
- **Billing:** `src/lib/billing/entitlements.ts`. There's no payment provider adapter
  (checkout can't charge). AI spending is controlled by per-user, global, token and rate
  budgets (`src/lib/aven/usage.ts`, `budget.ts`).

## 2. Request pipeline (chat)

```
POST /api/aven/chat        learnerAccount() → zod chatSchema (message, references[])
prepareChat
  1 consent check                         (no resolution or writes without AI consent)
  2 references: request or, on retry, the ones saved with the original message
  3 resolveMentions                       ownership, friendship, block, membership checks
  4 planTurn(message, resolvedTypes)      command + intents → workflows, planning model, tool subset
  5 reserveUsage(selected tool bytes)     budgets, rate limit, usage limit → may stop here
  6 beginConversationTurn                 lease, history (12), references saved on the message
  7 compact context                       ≤5 active goal titles; full records only via tools
streamChat (≤ MAX_TOOL_ROUNDS = 6 provider rounds, 110 s timeout)
  8 Responses API with the turn's tools only, intent + command guidance, mention data block
  9 tool calls: refused unless offered this turn → strict zod → account-scoped executor
 10 write tools store proposals only → approval card; reply guard corrects false "done" claims
 11 finishConversationTurn, finishUsage (actual tokens), aven_turn_metrics log
POST /api/aven/proposals   approve / reject / undo (+ confirmHighImpact)
 12 resolveProposal: row locks → apply through application services → read back → record
```

## 3. Routing (`orchestration.ts`, `intent.ts`, `commands.ts`)

- **Commands:** parsed deterministically (`/name` at the start of the message). A command
  only fixes the workflow that the same words would reach; it never unlocks a tool.
- **Plain language:** deterministic intent patterns map to the same workflows.
- **Unrecognized, learning and multi-part requests:** keep the full toolset, so the model
  reasons over everything, the same as before the router existed.
- **Tools per turn:** 4 core reads, plus the workflow tools, plus reads for each mentioned
  record type.
- **Measured accuracy:** see the test report. The held-out evaluation shows low recall for
  unseen phrasings. The full-toolset fallback keeps the model capable, but saves no tokens
  on those turns.

## 4. Services the agent uses (no duplicated business logic)

| Capability | Authoritative service |
|---|---|
| Subjects, topics, library links | `src/lib/services/mutations.ts` `mutate()`, the workspace service the UI uses, with preconditions |
| Goals, milestones, tasks | `src/lib/goals/service.ts` `mutateGoal()` (versioned, cycle-checked) |
| Calendar | `src/lib/services/calendar.ts` `mutateCalendar()` (recurrence, exceptions) |
| Study scheduling | `src/lib/learning/slots.ts` (free-slot search), `src/lib/aven/planning.ts` (validation) |
| Topic coverage, goal health, gaps, practice | `src/lib/learning/*` |
| Next best action | `src/lib/goals/next-action.ts` |
| Study Circles | `src/lib/circles/assistant.ts` (privacy-filtered snapshot only) |
| Reminders | `scheduled_check_ins` (manual kind), delivered by the Aven scheduler |

## 5. Action approval policy (implemented)

- **Read tools:** run automatically for the authenticated account.
- **Changes:** *every* change is a proposal card (Approve, Modify, Reject). There's no
  automatic execution of writes. "Low-risk automatic changes" are deliberately not enabled;
  see section 9.
- **High impact:** deleting a subject or a goal, or more than three deletions in one
  proposal. These need a second, explicit confirmation, enforced on the server
  (`confirmationRequired` without `confirmHighImpact`), not only in the UI.
- **Workspace proposals:** claimed (pending → applying), applied by `mutate`
  (preconditions detect concurrent edits), read back, then recorded. If any step fails,
  the proposal returns to pending.
- **Other proposals:** applied in one transaction with row locks, then read back.
- **Replays and second tabs:** a repeated or concurrent approval returns the stored
  outcome. It never applies twice.

## 6. Companion mode (proactive)

Deterministic monitoring (layer A) builds:

- the morning briefing
- session reminders
- missed-session nudges
- the evening reflection
- the weekly review
- goal alerts
- learning alerts (overdue prerequisites, priority mismatch, postponed topics, missed
  sessions, reported difficulty)

All of these go through `notifications` and `notification_deliveries`, with in-app, push
and email channels. They respect preferences, quiet hours, snooze, daily caps,
deduplication keys and retries. No model calls are made; drafts are private pending
proposals. Details are in AVEN_PROACTIVE_COMPANION.md and AVEN_LEARNING_INTELLIGENCE.md.

## 7. Memory and preferences

- **Source of truth:** structured records, not memory.
- **AI preferences** (`ai_user_preferences.value`): study hours, study days, daily target,
  coaching style, and learning signals (self-reported difficulty and confidence, expiring
  after 60 days).
- **Free-text memory** (`ai_memory`): only through approved proposals, and editable in
  settings.
- **Per turn the model receives:** preferences, 5 memory excerpts (500 characters each), the
  conversation summary, 12 recent messages bounded by bytes, and verified mention data.

## 8. Database migrations

None in this change. New state lives in existing JSON columns:

- proposal kinds and `recommendationKey` in `ai_plan_proposals.value`
- `records` in `ai_plan_proposals.result`
- the `applying` status in the text `status` column
- `learningSignals` in `ai_user_preferences.value`
- `references` in `ai_messages.context`

Production can ship without a migration step.

## 9. Not implemented (proposals)

- **Automatic low-risk writes under a student permission.** This would need an explicit
  per-student setting, an audit view and undo for every kind.
- **Schedule-change notifications.** Changes are approved by the student in the card, so
  there's no separate notification yet.
- **Durable queue (Vercel Queues or similar)** for notification delivery beyond the current
  leased database worker. See the scaling plan.
- **Model-scored evaluations.** These need a non-production API key and a development
  database, neither of which is available here.
