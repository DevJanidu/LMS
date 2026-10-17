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
| `study_analytics` | `StudyAnalyticsCard` | `getWeeklyAnalytics`, `getStudyHistory` | `{ periodDays, minutes, sessions, previous \| null }`; the comparison appears only when the earlier period has records |
| `circle_leaderboard` | `CircleLeaderboardCard` | `getStudyCircles` | `{ weekEndsAt, me { rank, minutes, minutesBehindNext }, rows[≤10] }`; verified timer time only, already privacy-filtered |

These cards are **not** in this registry by design. They are proposal kinds rendered by
`ProposalCard` and gated by `/api/aven/proposals`:

- study plan
- calendar action
- action approval
- success result

## Adding a component

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
