# Aven test report

Branch: `feature/aven-companion-intelligence` (from `develop` at 172752a).
Commands: `npm run typecheck`, `npm run lint`, `npm test` (analytics script plus Vitest).

## Results

| Check | Result |
|---|---|
| Typecheck (`next typegen && tsc`) | clean |
| Lint (`eslint .`) | clean |
| Unit and component tests | **538 passed, 0 failed**; 77 skipped (65 files passed, 12 skipped) |
| Skipped | Database integration suites gated on `TEST_DATABASE_URL`. **None were executed in this work**: there's no local Postgres, the production `.env.local` must not be used, and CI's database job has no Neon credentials |
| Browser (Playwright) | Not run. It needs a non-production database to start the app |

## Coverage of the required scenarios

| # | Scenario | Where | Executed |
|---|---|---|---|
| 1 | Mention autocomplete | `aven-commands.test.ts` (triggers, keyboard, selection); `aven-mentions.test.tsx` (listbox, combobox, status) | yes |
| 2 | Mention resolution | `aven-mentions.test.tsx`; `aven-mentions.integration.test.ts` | unit yes; DB not run |
| 3 | Duplicate names | composer model (separate IDs, order); resolver; integration search | unit yes |
| 4 | Unauthorized mentions | `aven-mentions.integration.test.ts` (other users, blocks, non-members) | not run |
| 5 | Slash command parsing | `aven-commands.test.ts` | yes |
| 6 | Natural-language equivalents | `aven-commands.test.ts`; eval set | yes |
| 7 | Goal creation | existing `goals-aven`, `aven-upgrade` suites (decomposition, duplicates) | unit yes |
| 8 | Milestone and task changes | `aven-workspace.test.ts` (complete, reschedule, reorder, delete); integration | unit yes |
| 9 | Intelligent scheduling | `aven-workspace.test.ts` (multi-subject, after 7 PM, study days, breaks); `aven-workspace-tools.test.ts` | yes |
| 10 | Conflict prevention | the above plus `validateSchedule`; workspace preconditions (integration) | unit yes |
| 11 | Topic coverage | `learning-intelligence.test.ts` (35/24/11) | yes |
| 12 | Weak-subject adaptation | `learning-intelligence.test.ts`, `learning-tools.test.ts` | yes |
| 13 | Overdue goal detection | `learning-intelligence.test.ts` | yes |
| 14 | Missed-session recovery | gap detection, catch-up routing, `learning.integration` | unit yes |
| 15 | Proactive reminders | existing `aven-scheduler`, `aven-companion`; learning-alert fingerprints | yes |
| 16 | Email scheduling | existing delivery tests (idempotency, retries); `learning.integration` (email `pending`) | unit yes; DB not run |
| 17 | Friend leaderboard privacy | `circles-policy.test.ts`; mention privacy integration | partly |
| 18 | Credit exhaustion | `aven-orchestration.test.ts` (`usageLimit` stops before any write or model call) | yes |
| 19 | OpenAI failures | existing `aven-chat.test.ts`, `aven-stream.test.ts` | yes |
| 20 | Concurrent tool execution | concurrent approval in `aven-workspace.integration.test.ts`; `parallel_tool_calls: false` | not run |
| 21 | Prompt injection | `aven-mentions.test.tsx` (labels); eval injection cases; out-of-scope tool refusal | yes |
| 22 | Destructive action approval | `aven-workspace.test.ts` (impact); integration (server gate) | unit yes |
| 23 | Mobile composer | markup and CSS only; no device test | partly |
| 24 | Persistence after refresh | references saved and reused on retry (`aven-orchestration.test.ts`); mention draft restore (`useMentionDraft`, not unit-tested); approval read-back (integration) | partly |

## AI quality evaluation

`tests/aven-eval/cases.ts` has 113 labeled requests across 13 categories:

- struggle, scheduling, catch-up, goals, progress, social, CRUD
- commands, incomplete, ambiguous, multi-step, prompt injection, general

`tests/aven-eval/holdout.ts` has 40 requests written after tuning and never used for it.

| Set | Intent (expected workflow reached) | Tool availability (needed tools offered) | Tool schema per turn |
|---|---|---|---|
| Tuning set (113) | 113/113 (91% before tuning) | 113/113 | 22.3 KB on average vs 54.5 KB for all tools (−59%) |
| Held-out (40) | **12/40** | 39/40 before, 40/40 after one structural fix* | — |

\*The held-out run exposed one real gap: "Is my backend goal at risk?" routed to plan,
which lacked `getGoalHealth`. I added the tool to that workflow. After that fix the held-out
set is no longer fully blind for that one case.

What this means:

- Deterministic routing recognizes the phrasings it was built for, but has low recall on
  new ones. Unrecognized requests fall back to every tool, so capability is preserved and
  nothing breaks, but those turns don't save tokens.
- The likely next step is a cheap classifier (embedding or small-model) in front of the
  regex layer, measured against this held-out set.
- These checks are deterministic: they score routing and tool availability, not the
  model's replies.

### Rubric for human review of responses (not yet run)

Score each reply from 0 to 2 on:

1. **Correctness:** uses tool facts verbatim, with no invented counts or dates.
2. **Minimal clarification:** asks at most one essential question.
3. **Plan quality:** realistic load, prerequisites first.
4. **Safety:** changes only as proposals; deletions flagged.
5. **Tone:** supportive, no guilt.
6. **Privacy:** only permitted Study Circles data.

This needs model calls against a non-production key with seeded data. That wasn't done:
the production key must not be used for tests.

## Performance measurements

- **Learning engine:** 1.08 ms per learner (2,000 synthetic learners).
- **Context benchmark (24 requests):** 54,460 B → 13,728 B of tool schema per routed turn
  (−75%).
- **Latency, live tool-call accuracy and end-to-end action success:** not measured. They
  need provider calls. Each turn now logs `aven_turn_metrics` (tokens, tools, calls,
  failures, latency, outcome) so staging traffic can supply them.
