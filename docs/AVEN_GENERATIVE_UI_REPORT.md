# Aven generative UI engine — implementation report (2026-10-18)

Branch `feature/aven-generative-ui-engine`, based on `develop`. Architecture is in
`AVEN_GENERATIVE_UI.md` and the schemas are in `AVEN_COMPONENT_REGISTRY.md`.

## Repository audit (what existed and was reused)

- **Stack.** Next.js 16.3 (App Router, Turbopack), React 19, TypeScript, Tailwind v4,
  next-intl, Zod 4, Drizzle on Neon Postgres, Vitest, Playwright. No shadcn/ui and no
  Motion library: the project uses its own UI primitives and CSS motion. Per `AGENTS.md`,
  no packages were added.
- **AI.** OpenAI Responses API with streaming and strict function tools (`tools.ts`).
  Chat and planning are both configured as `gpt-6-luna` (verified via `/v1/models`) with
  reasoning effort `low` and `medium`. Durable streaming and recovery
  (`AVEN_STREAMING_ARCHITECTURE.md`) were reused unchanged.
- **Approvals.** Every write is a proposal (`ai_plan_proposals`) approved in `ProposalCard`
  under a row lock, with status and expiry checks; it already provides the approval and
  success cards. Reused for "save checklist as goal" and for planner approval.
- **Scheduling.** The deterministic multi-subject planner (`learning/slots.ts`) was
  extracted into `aven/study-planner.ts`, so the tool and the interactive planner share
  one code path.
- **Data cards.** The versioned registry of tool-built cards was extended rather than
  duplicated.
- **Usage and billing.** Per-request token reservation and settlement (`usage.ts`), plus
  plan entitlements (`billing/`). Unchanged; the proposed Rs. 900 / 1,600 / 2,400 tiers
  are not hard-coded anywhere.
- **Security primitives reused.** `learnerAccount`, `validatedBody` (same-origin, size
  limit) and `requestLimit` (fail-closed rate limit).

## Implemented

- **Presentation tools:** checklist, quiz (server-graded, answer key never sent), flashcards,
  diagram (layered layout, measured SVG connectors, node details, text list of
  connections), study targets (sliders, radios, select, live arithmetic).
- **Data cards:** daily study-minutes bar chart (SQL aggregation per local day) and the
  interactive study planner (local totals, deterministic re-plan, conflicts and
  trade-offs, approval into the real calendar).
- **Placeholders and cost:** early placeholders from `response.output_item.added`; invalid
  blocks are withdrawn; no follow-up model round after a block when text already exists.
- **Persistence:** `ui:*` interaction state with compare-and-set, optimistic updates and
  rollback, conflict adoption across tabs, `keepalive` flush on `pagehide`, and survival
  of snapshot and final writes.
- **API:** `POST /api/aven/components` for `state`, `quizAnswer`, `quizReset`,
  `saveChecklist` and `replan`.
- **Intent routing:** presentation tools are offered only for matching requests (or when
  no workflow is recognised, or for `/study`).
- **Database:** no migration and no new tables. State and secrets are keys in the existing
  `ai_messages.context` JSONB.

## Verification

All runs below happened in this session.

- **Static checks:** `tsc --noEmit` clean; ESLint clean on all changed areas.
- **Vitest:** 68 files, **607 tests passed**, including 23 new tests in
  `tests/aven-generative-ui.test.tsx`:
  - schema limits and refinements
  - quiz secrecy (stream and saved context)
  - intent matrix
  - no follow-up request after a block
  - placeholder withdrawal on invalid content
  - layout with cycles
  - local calculations
  - grounded daily series
  - safe rendering of HTML-like labels
- **Playwright on the real stack** (`tests/e2e/aven-generative-ui.spec.ts`): **9/9
  passed**. The model was a deterministic mock (`scripts/mock-openai-provider.mjs`); the
  database was the **development** branch database (the spec refuses the registered
  production host); three isolated fixture learners were created and deleted.

| Scenario | Checked |
| --- | --- |
| Checklist | 5 real checkboxes; "2 of 5 done"; progress bar at 40%; "Saved"; collapse state; **1 model request** before and after interactions; refresh restores ticks and collapse; "Save as goal" → approval → goal with 5 to-do tasks in the database |
| Quiz | radios; answer text absent from the page before answering; wrong answer shows feedback, explanation and the correct option; a second submission cannot change the result; refresh restores the score |
| Diagram | 5 node buttons, 5 connectors, node detail, connection list; light and dark screenshots |
| Planner | keyboard slider 60 → 45 min with totals updating locally; time window radio; "Update preview" with **no extra model request**; exactly one approvable draft; approval creates `schedule_blocks` |
| Study targets | keyboard slider; live "sessions per week"; radio and select; saved; refresh restores |
| Security | another student gets 404 on the block and the conversation; state with unknown ids gets 400 |
| Duplicate submissions | two concurrent re-plans → one 200 and one 409, one pending draft |
| Mobile and keyboard | 375 px with no horizontal overflow; Space toggles a focused checkbox |
| Usage | exactly one usage record per message (7 and 1); none from interactions |

## Known limitations

- **No real model in the browser runs.** The mock keeps them deterministic and free. How
  well `gpt-6-luna` picks the right tool and fills the strict schemas should be checked
  with a small, budgeted live run.
- **Checklist ticks are not copied** into goal tasks: the existing rule keeps
  AI-originated tasks to-do. Changing that needs a product decision.
- **Math is not typeset.** It renders as monospace text; no KaTeX was added, per the
  no-new-packages rule.
- **Diagram layout** is layered top to bottom for up to 24 nodes, with no manual
  dragging. React Flow or Mermaid were not added (new packages, no clear need yet).
- **Charts are CSS bars** for daily minutes. ApexCharts stays available for richer charts
  later.
- **AI usage limits** were not exercised in the browser. They rely on the existing, unit
  tested budget logic (`tests/aven-budget.test.ts`).
- **The earlier streaming spec was not re-run** (`tests/e2e/aven-streaming.spec.ts`,
  covering tab switch and navigation). It loads env via `@next/env`, and `.env.local` was
  removed in the env-file change (PR #15); it needs the PR #15 loader or explicit env vars
  to run.
- **Tablet viewport and screen-reader testing** were not done. Semantic HTML, labels,
  live regions and keyboard paths are in place.
- **Local browser runs of this branch need their own working directory.** Next 16 allows
  one dev server per folder, so these runs used a separate git worktree whose local
  `next.config.ts` widened `turbopack.root` (never committed).

## Run and verify

```powershell
# unit tests (no database)
npx vitest run tests/aven-generative-ui.test.tsx tests/aven-streaming.test.tsx tests/aven-chat.test.ts

# browser tests: mock model + dev server on the development database
node scripts/mock-openai-provider.mjs 4010
# start the app with APP_ENV=development, the .env.develop database, AVEN_PROVIDER_URL=http://127.0.0.1:4010/v1/responses,
# APP_URL=http://localhost:3100 and non-production credentials (the isolation guard refuses production ones)
$env:PLAYWRIGHT_CHANNEL='chrome'; $env:PLAYWRIGHT_EXTERNAL_SERVER='1'; $env:APP_URL='http://localhost:3100'; $env:AVEN_E2E_PROVIDER='http://127.0.0.1:4010'
npx playwright test tests/e2e/aven-generative-ui.spec.ts --workers=1
```
