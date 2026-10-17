# Aven generative UI

Aven's responses can include study cards. The model never writes UI: it has no way to send
HTML, JSX, CSS or scripts. Cards come from an approved registry
(`src/lib/aven/ui-components.ts`) and are built on the server from **verified tool
output** (`src/lib/aven/ui-builders.ts`).

## How a card gets into a reply

1. The model calls a read tool, for example `getWeeklyAnalytics`. Picking the tool is the
   model's choice of component, and it costs no output tokens.
2. The server emits `tool-start` with a user-safe activity category, then a
   `ui-component` placeholder (`status: "loading"`, no data) for each card the tool can
   produce.
3. The tool runs with account-scoped authorization. Its result goes through
   `componentsFromTool` and is validated against the registry schema.
4. The server emits `ui-component` with `status: "ready"` and the validated data. If no
   valid data came back, it emits `status: "removed"`, so a placeholder never lingers and
   is never filled with invented values.
5. On completion, the ready components are saved with the reply as
   `context.components`: a versioned JSON envelope list.

## Progressive rendering

- Each component has a stable `id`, which is the slot key. The placeholder turns into its
  card in the same DOM slot.
- `AvenReveal` measures its content with `ResizeObserver` and transitions `height`
  (260 ms). The skeleton grows smoothly into the card instead of jumping.
- Cards enter with `aven-rise` (240 ms fade and 6 px rise). Under
  `prefers-reduced-motion`, all of this is disabled.
- `applyUiComponent` keeps arrival order. A late `loading` event never hides a card that
  is already `ready`.
- Partial JSON is never rendered. Tool results are atomic, so "progressive" means
  placeholder → validated card, not field-by-field patches from unvalidated model output.

## Approval and action cards

Mutations never travel through `ui-component`. Write tools create **proposals**
(`ai_plan_proposals`). They stream as `proposal` events and render with the existing
`ProposalCard`, which covers:

- the study plan
- calendar action
- action approval (approve, edit, reject)
- success results, with links to the created or updated records

Approval goes through `/api/aven/proposals`. That route re-checks identity, ownership,
entitlements, expiry and proposal status in a transaction, so a double click or a replayed
approval cannot apply twice.

## Persistence and migration

- Saved replies store `components` as `[{ id, type, version, status: "ready", data }]`.
- Replies saved before the registry existed stored `goalCards` and `nextActions` under
  their own keys. `storedComponents()` migrates them on read.
- On render, every stored payload is validated again. Unknown types, versions newer than
  the build, and invalid data are dropped silently. The text of the reply is unaffected.
- A stopped turn keeps the cards it had already shown, because the cancel write preserves
  the snapshot context.

## Token efficiency

Cards cost the model nothing to produce. It never emits markup or JSON for presentation,
and the rendering code lives in the application.
