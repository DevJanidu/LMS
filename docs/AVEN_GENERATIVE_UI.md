# Aven generative UI engine

Aven can put interactive learning blocks inside a conversation: checklists, quizzes,
flashcards, diagrams, study-target controls, an adjustable study planner, and data cards
built from the student's records. The model never writes UI. It chooses an approved block
type and supplies typed content. The server validates that content, and trusted React
components render it.

## Pipeline

```
student message
  → orchestration (planTurn): workflows, data tools, and whether to offer presentation tools
  → model (Responses API, strict function calling)
      ├─ data tools (getGoalDetails, scheduleStudySessions, …) → verified records
      │     → ui-builders: cards from tool output only (progress, tasks, analytics, planner)
      └─ presentation tools (showChecklist, showQuiz, showFlashcards, showDiagram, showStudyTargets)
            → presentation-tools: strict schema + registry validation; quiz answers split off as a server secret
  → stream protocol: ui-component events (loading placeholder → ready / removed)
  → AvenGenerativeUI: registry type → trusted component, re-validated on render
  → interactions: local first; saved via /api/aven/components (compare-and-set, no model call)
```

## Two sources of blocks

| Source | Blocks | Grounding |
| --- | --- | --- |
| **Data cards** (`ui-builders.ts`) | goal progress, next actions, open tasks, topic coverage, study analytics with a daily chart, Study Circles leaderboard, study planner | Built only from verified tool results. Numbers are never computed or invented by the model. Daily minutes come from SQL aggregation in the student's timezone. |
| **Presentation tools** (`presentation-tools.ts`) | checklist, quiz, flashcards, diagram, study targets | Content written by the model from general knowledge, labelled as such. These tools read and write no records. |

Presentation tools are offered only when the request asks for something a block serves
better (`wantsPresentation`), when no workflow is recognised, or for `/study`. Plain
questions such as "What is polymorphism?" stay text-only, and the tool schemas don't add
tokens to every turn.

## Cost controls

- **No follow-up round when it isn't needed.** If a response already contains text and its
  only calls were presentation tools, the turn ends without another model request.
  Verified in unit tests and in the browser via request counters.
- **Interactions never call the model.** Ticking boxes, moving sliders, choosing radios,
  flipping cards, grading quiz answers and re-planning a schedule are local or
  deterministic.
- **Saves are batched.** Rapid changes become one write after 450 ms, and transient slider
  positions are not stored individually.
- **Usage accounting is unchanged.** There is one usage record per student message
  (verified); block interactions create none. Plan allowances use the existing
  budget/entitlement system (`usage.ts`, `billing/entitlements`).
- **Model routing is unchanged.** Requests for blocks use the chat configuration; planning
  workflows keep the planning configuration. Both are currently `gpt-6-luna` (verified
  against `/v1/models`), with `low` and `medium` reasoning effort respectively.

## Streaming and progressive rendering

- **Placeholder first.** When the model starts a presentation call
  (`response.output_item.added`), a placeholder holds the block's slot while its arguments
  stream.
- **Validated or removed.** The validated block then replaces the placeholder in the same
  slot, with an animated height via `AvenReveal`. Invalid content withdraws the placeholder
  and the model is told why.
- **Partial content is never rendered.** Blocks appear only once their whole payload has
  validated.
- **Usable while streaming.** A finished block can be used while the rest of the reply is
  still streaming. State the student saves during streaming is kept, because snapshot and
  final writes merge `ui:*` keys back in.
- **Restores instantly.** Blocks load from durable snapshots on refresh and navigation, as
  in `AVEN_STREAMING_ARCHITECTURE.md`.

## Persistence

Interaction state is stored on the reply row as `ui:<componentId>` = `{"v": n, "data": …}`.
No migration is needed and there is no new table.

| Block | Saved state |
| --- | --- |
| Checklist | checked item ids, collapsed sections |
| Flashcards | position, known, review again |
| Study targets | slider values, technique, time of day |
| Quiz | first answer per question, plus the revealed answer and explanation |
| Study planner | the latest adjusted plan and its proposal id |

- **Writes:** compare-and-set on `v`. A stale tab gets a conflict, adopts the saved
  version, and shows "Updated in another tab". A failed save rolls back and shows an
  error.
- **Leaving the page:** pending changes are sent with `keepalive` on `pagehide`, so a
  change made just before refreshing or navigating is not lost (a browser test caught
  that bug).
- **Other tabs:** they are told to refresh via `BroadcastChannel`; the server stays
  authoritative.

## Workspace integration

- **Checklist → goal.** "Save as goal" builds a goal proposal (sections become milestones,
  items become tasks). It is approved in the existing `ProposalCard`, then created by the
  goal service. Under the existing safety rule, tasks start as to-do: an AI proposal
  never records work as completed.
- **Study planner.** It appears after `scheduleStudySessions` creates a real proposal.
  Session length, per-subject session counts and time window recalculate totals locally.
  "Update preview" re-runs the same deterministic planner (`study-planner.ts`) against the
  live calendar, retires the old draft and creates the new one. A conditional update means
  only one of two concurrent requests can win. Approval goes through the existing schedule
  approval, which saves sessions with the calendar service; only then does the card show
  "Open planner".
- **Study targets.** "Plan these hours" puts a prepared message in the composer; the
  student decides whether to send it.

## Security

- **Allowlist and validation.** Only registry types render. Every payload is re-validated
  with Zod on the server (before streaming and saving) and on the client (before
  rendering).
- **Limits.** Unknown types, newer versions and payloads over 24 KB are dropped.
- **Plain text only.** Labels are text, never markup: no `dangerouslySetInnerHTML`, no
  model-generated code, and no diagram definitions are parsed or executed. Links in
  Markdown stay limited to Acadence routes and http(s).
- **Quiz answer keys** live server-side as `secret:<id>`. They are removed from every
  conversation response, never streamed, and revealed per question only after an answer.
  The first answer counts.
- **`/api/aven/components`** is authenticated, same-origin (CSRF), size-limited,
  rate-limited (120 per minute, fail-closed), and ownership-checked through the
  conversation.
- **Server-side state checks.** State is validated against its block, so unknown checklist
  items or flashcard ids are rejected. Planner subjects must be ones the original
  proposal resolved.
- **Mutations** still require the existing approval flow; a block cannot bypass it.

## Adding a block

See `AVEN_COMPONENT_REGISTRY.md`.
