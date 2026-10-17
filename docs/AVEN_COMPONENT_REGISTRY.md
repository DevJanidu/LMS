# Aven component registry

Source: `src/lib/aven/ui-components.ts`. Builders: `src/lib/aven/ui-builders.ts`.
Renderers: `src/components/aven/AvenGenerativeUI.tsx` and `src/components/aven/cards/`.

## Envelope

```ts
{ id: string; type: UiComponentType; version: number;
  status: "loading" | "ready" | "removed"; data?: <schema for type> }
```

Only `ready` envelopes carry data, and only data that passed the type's schema.

## Registered components (all version 1)

| Type | Card | Built from | Data |
| --- | --- | --- | --- |
| `goal_progress` | `GoalProgressCard` (stack) | `getUserGoals`, `getGoalDetails` | `{ goals: GoalCard[1..4] }`, the latest four goals discussed in the turn |
| `next_actions` | `NextBestActionCard` | `getNextBestAction` | `{ actions: NextAction[1..] }` from the deterministic ranking engine |
| `task_list` | `TaskListCard` | `getGoalDetails` | `{ goalId, goalTitle, tasks[1..8]: { id, title, status, priority, dueDate, overdue }, remaining }`, open tasks only |
| `topic_coverage` | `TopicCoverageCard` | `auditTopicCoverage` | `{ subject, counts { required, completed, remaining, inProgress, overdue }, overdue[≤5], nextTopics[≤3] }` |
| `study_analytics` | `StudyAnalyticsCard` | `getWeeklyAnalytics`, `getStudyHistory` | `{ periodDays, minutes, sessions, previous \| null, daily?[≤31] }`; the comparison appears only when the earlier period has records; `daily` is SQL-aggregated per local day and drives the bar chart (optional, so earlier saves still parse) |
| `circle_leaderboard` | `CircleLeaderboardCard` | `getStudyCircles` | `{ weekEndsAt, me { rank, minutes, minutesBehindNext }, rows[≤10] }`; verified timer time only, already privacy-filtered |
| `study_planner` | `StudyPlannerBlock` | `scheduleStudySessions` (pending proposal only) | `{ proposalId, from, to, earliest, latest, window, minutes, dailyTargetMinutes, studyDays, subjects[1..6], placed, unplaced, tradeoffs[≤10] }`; re-planned with `replan`, no model call |

### Model-authored blocks (presentation tools)

The content is written by the model, validated against `src/lib/aven/ui-blocks.ts`, and
stored with the reply. Interaction state lives in `ui:<id>`.

| Type | Tool | Block | Data and limits | Saved state |
| --- | --- | --- | --- | --- |
| `checklist` | `showChecklist` | `ChecklistBlock` | `{ title, sections[1..8]: { id, title, items[1..15]: { id, label, hint } } }`, ≤60 items, unique slug ids | `{ checked[], collapsed[] }` |
| `quiz` | `showQuiz` | `QuizBlock` | `{ title, questions[1..10]: { id, prompt, options[2..6] } }`; `correctIndex` and `explanation` are kept in `secret:<id>` | `{ answers: { [questionId]: { choice, correct, correctIndex, explanation } } }`, first answer counts |
| `flashcards` | `showFlashcards` | `FlashcardsBlock` | `{ title, cards[1..30]: { id, front, back } }` | `{ index, known[], reviewing[] }` |
| `diagram` | `showDiagram` | `DiagramBlock` | `{ title, kind: flow\|architecture\|roadmap\|concepts, nodes[2..24]: { id, label, detail, group }, edges[≤40]: { from, to, label } }`; edges must reference existing nodes | none (selection is transient) |
| `study_targets` | `showStudyTargets` | `StudyTargetsBlock` | `{ title, weeklyHours 1–60, sessionMinutes 15–180 (step 5), breakMinutes 0–30, technique, timeOfDay }` | the same values without `title` |

Every block payload is capped at 24 KB.

These cards are **not** in this registry by design. They are proposal kinds rendered by
`ProposalCard` and gated by `/api/aven/proposals`:

- study plan
- calendar action
- action approval
- success result

## Adding a model-authored block

1. **Schema.** Add it to `ui-blocks.ts` with bounded strings, capped lists, slug ids and
   cross-reference refinements, then register it in `uiComponentSchemas`.
2. **Tool.** Add a strict tool schema and description in `presentation-tools.ts`. Map it
   in `presentationComponentType` and in `activity.ts` (category `composing`). Never ask
   the model for markup, styling or code.
3. **Secrets.** If part of the content must stay hidden (answers), split it in
   `buildPresentation` into a server-only secret.
4. **State.** If the block keeps state, add a schema to `componentStateSchemas` and a
   check that it only references the block's own ids.
5. **Component.** Render it in `src/components/aven/generative-ui/` with `useBlockState`
   for saved state, and add copy under `aven.blocks`.
6. **Routing.** If needed, add the request words to `PRESENTATION` in `orchestration.ts`.

## Adding a data card

1. **Schema.** Add an entry to `uiComponentSchemas`: `{ version: 1, schema: z.object(…) }`.
   Bound every array and string, and use `z.uuid()` for every ID.
2. **Builder.** Map the producing tool in `producers` and build the data in
   `componentsFromTool` with `readyComponent(type, data)`. Read only fields of the
   verified tool result. Never use the model's arguments or text.
3. **Card.** Create `src/components/aven/cards/<Name>Card.tsx` on top of `ActionCard`.
   Use theme tokens only and add copy under `aven.cards` in `src/messages/en.json`.
4. **Renderer.** Add the type to `eyebrows` and the `switch` in `AvenGenerativeUI.tsx`.
   TypeScript forces exhaustiveness through the `UiComponent` union.
5. **Tests.** Cover valid and invalid payloads and the builder in
   `tests/aven-streaming.test.tsx`.

## Changing a schema

Bump `version` whenever an existing field changes meaning or shape. Clients drop versions
newer than they know, so an old tab never misrenders a new payload. To keep old saved
replies visible, either keep the old schema readable or add a migration in
`storedComponents`, as is already done for the `goalCards` and `nextActions` keys.
