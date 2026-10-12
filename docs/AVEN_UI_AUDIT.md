# Aven UI Audit

Audit of the `/aven` frontend before the conversational-workspace redesign
(Master Prompt 1). Findings are grouped by area; each ends with the
remediation shipped in the redesign.

## Scope reviewed

- Route: `src/app/[locale]/(learner)/aven/page.tsx`, `loading.tsx`
- Components: `src/components/aven/*` (`AvenCompanion`, `AvenComposer`,
  `AvenConversationSidebar`, `AvenNavigation`, `AvenActivity`, `AvenMarkdown`,
  `AvenNotifications`, `AvenSettings`, `AvenOnboarding`, `ProposalCard`,
  `ProposalDetails`)
- Backend contracts: `src/app/api/aven/**`, `src/lib/aven/chat.ts`,
  `stream.ts`, `conversations.ts`, `context.ts`, `preferences.ts`,
  `proactive-conversations.ts`, `notifications.ts`, `validation.ts`
- Styles: Aven rules in `src/app/workspace.css`

## 1. Layout and information architecture

| # | Problem | Impact |
|---|---------|--------|
| L1 | Page header duplicates the "Aven AI" title already in the global sidebar and top bar, plus a description line. | Wastes vertical space; chat starts low on the screen. |
| L2 | A three-tab `tablist` (Chat / Notifications / Settings) sits above the chat. Switching tabs unmounts the chat panel. | Large controls above the chat; scroll position and in-flight state of the chat panel are lost when visiting settings. |
| L3 | A budget strip and an "Enable study reminders" strip render above every chat. | Noise that repeats on every visit; admin-level budget detail on a learner surface. |
| L4 | Chat lives inside a bordered, rounded card nested inside the page content. | "Dashboard widget" feel rather than a workspace; double borders on mobile. |
| L5 | Conversation list is hidden by default and toggled from the header; no search, no rename, no indication of recency. | History is hard to discover and navigate. |
| L6 | Message column has no max width (`max-w-5xl` assistant bubbles); long lines on wide screens. | Poor readability. |
| L7 | Quick-prompt chips sit permanently between the transcript and the composer and only fill the input (they do not send). | Extra row on every screen; suggestions do not trigger real functionality. |

**Remediation:** full-height workspace with a compact conversation sidebar
(identity, new chat, search, collapsible recent history, rename, delete) and
a centered ~800px column. Notifications and settings move into dialogs opened
from small icon buttons; the budget moves to settings. The empty state is a
personalized welcome with four suggestions that send immediately.

## 2. Composer

| # | Problem |
|---|---------|
| C1 | Composer is a full-width form bar with a top border; text area uses generic form-control styling. |
| C2 | Help text toggles visibility with consent/busy state, shifting layout when streaming starts. |
| C3 | Stop uses a close (×) icon with a visible "Stop" label that replaces "Send", changing button width. |
| C4 | Draft text is not preserved across reloads or conversation switches. |
| C5 | Auto-resize collapses to `auto` height when empty, causing a one-frame jump. |

**Remediation:** rounded, subtle-surface composer with fixed-size icon
button (arrow-up to send, stop square while generating), stable help line,
per-conversation drafts persisted to `sessionStorage`, and focus ring
transitions that respect reduced motion.

## 3. Streaming

The backend already streams real OpenAI Responses API deltas
(`response.output_text.delta`) to the browser as SSE `delta` events; no
simulated typing exists. Client-side problems:

| # | Problem |
|---|---------|
| S1 | Each delta calls `setMessages(map(...))`, re-rendering the whole transcript and re-parsing Markdown for every message, once per network chunk. |
| S2 | Auto-scroll forces `scrollTop = scrollHeight` inside the delta handler and in an effect; there is no way to resume following after scrolling up. |
| S3 | On completion the client reloads the conversation and swaps optimistic message objects (keyed by request id) for database rows (keyed by row id). Every message remounts, causing a visible flash and scroll jump. |
| S4 | The streaming placeholder renders the literal text "Aven is working on your reply…" through the Markdown renderer as if it were content. |
| S5 | After a proposal is emitted the server deliberately withholds further deltas until a safety check runs, then sends `replace`. The UI showed no activity during this window. |

**Remediation:** deltas are buffered and flushed once per animation frame;
messages render through a memoized `AvenMessage`; Markdown is split into
blocks and each completed block is memoized so only the trailing block
re-parses. Messages are keyed by `role + requestId` (unique per conversation
in the database), so reconciling with persisted rows does not remount.
Smart auto-scroll follows the bottom, pauses when the user scrolls up and
offers a "Jump to latest" control. When a proposal arrives the activity line
switches to "Preparing changes…", which mirrors the real server behaviour.

## 4. Activity states

| # | Problem |
|---|---------|
| A1 | Only nine of ~30 tool names had labels; most fell back to the generic message. |
| A2 | The same `AvenActivity` component also rendered "Loading your conversation…" under the chat when history loaded. |

**Remediation:** activity labels for every read/write tool, grouped into
user-facing phrases (reviewing goals, checking calendar, checking conflicts,
preparing a study plan, preparing changes, applying approved changes). No
tool arguments are shown. History loading uses a skeleton instead.

## 5. Message presentation

| # | Problem |
|---|---------|
| M1 | Both roles render as tinted bubbles with a "You"/"Aven AI" overline and a timestamp on every message. |
| M2 | Markdown renderer supports only `#` headings, `-` bullets, bold, inline code and links. No ordered lists, tables, blockquotes, italics; lists render as `<p>` with a literal "•". |
| M3 | No copy, regenerate or per-message retry controls (retry is a button glued inside a `<time>` element). |
| M4 | Proposal cards are always rendered after all messages, regardless of when they were created. |

**Remediation:** compact right-aligned user bubbles, background-free
assistant messages, semantic Markdown (lists, ordered lists, tables, code
blocks with copy, blockquotes, links), and a subtle action row
(copy / regenerate / retry). Proposals are interleaved chronologically.

Regenerate required a small backend extension (documented below) because the
existing retry contract rejected requests that already had a complete answer.

## 6. Structured action cards

| # | Problem |
|---|---------|
| P1 | A single 300-line `ProposalCard` renders every proposal kind with ad-hoc paragraphs; goal workload is not summarized. |
| P2 | Schedule proposals show start → end strings only; no recurrence, subject, or conflict information. |
| P3 | Calendar change proposals do not visually separate "before" and "after". |
| P4 | There is no goal progress card; progress is only described in Markdown prose. |

**Remediation:** dedicated `GoalProposalCard`, `ScheduleProposalCard`,
`ScheduleChangeCard` and `GoalProgressCard` components inside a shared
`ActionCard` shell. The progress card consumes a server-built,
zod-validated payload emitted when Aven reads goal records; it is persisted
with the assistant message so it survives refresh. Nothing is inferred from
Markdown.

## 7. Conversation management

| # | Problem |
|---|---------|
| H1 | No rename or search. |
| H2 | Switching conversations calls `router.replace` (a server navigation that re-runs the page loader). |
| H3 | Deleting a conversation refetches the entire bootstrap. |
| H4 | Scroll position is not restored when returning to a conversation. |

**Remediation:** rename (new `renameConversation` mutation), server-side
title search (`?history=true&q=`), URL updated with `history.replaceState`
instead of a router navigation, local list updates after delete/rename, and
per-conversation scroll restoration.

## 8. Proactive messages

Proactive reminders are already stored as assistant messages in a
"companion" conversation with a context snapshot (`notificationId`, `kind`,
`blockId`, …). The chat rendered them as plain text with no actions, and the
snapshot could become stale after the learner skipped or rescheduled.

**Remediation:** proactive messages render with contextual actions (Start
studying, Reschedule, Snooze, Skip, Ask Aven). The conversation loader now
merges the latest `resolved` state from `notification_actions` so resolved
sessions show their outcome instead of stale buttons. Raw notification
records are never shown.

## 9. Notifications and settings

| # | Problem |
|---|---------|
| N1 | Notifications and settings are full tabs that replace the chat. |
| N2 | Notification cards are large bordered panels with five buttons each. |
| N3 | Settings mix AI consent, reminder schedule, browser push and resource access in one long form. |

**Remediation:** a notification center dialog with compact rows and the
same shared action bar used by proactive chat messages, and a settings dialog
with four separated sections: AI processing consent, reminder preferences,
browser notification permission, resource access (plus memory and usage).
Onboarding only appears until consent is saved.

## 10. Accessibility

| # | Problem |
|---|---------|
| X1 | `aria-live="polite"` on the entire scroll container announces every delta. |
| X2 | Icon-only buttons in the sidebar lack visible focus treatment on hover-revealed controls. |
| X3 | Tab panel ids reference non-existent elements when the sidebar is closed. |

**Remediation:** a dedicated visually hidden live region announces only
activity changes and completed replies; hover-revealed controls also appear
on `focus-within`; tabs removed.

## Backend contract changes (additive)

| Change | Reason |
|--------|--------|
| `preferenceMutationSchema` gains `renameConversation` | Conversation rename. |
| `GET /api/aven?history=true&q=` | Conversation search. |
| `chatSchema.regenerate` (optional) | Regenerate a completed reply for the latest user message. Superseded replies are marked `status = "superseded"` and excluded from model context. |
| SSE `goalProgress` event; persisted in assistant `context.goalCards` | Structured goal progress card. |
| `getConversation` merges `resolved` notification state into proactive message context | Prevent stale proactive actions. |
| `avenBootstrap` returns `hasGoals` | Goal-creation suggestion when no goals exist. |

All existing request/response shapes remain valid; new fields are optional.

## Verification (2026-10-12)

| Check | Result |
|-------|--------|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npx vitest run` | 335 passed, 48 skipped (database/provider suites) |
| `npm run build` | Pass |
| New unit tests | `tests/aven-ui.test.ts` (Markdown parser, message reconciliation, activity mapping, goal cards, superseded history); two new cases in `tests/aven-chat.test.ts` (goal progress events and persistence, stopped partial text) |
| New integration test | `tests/aven-upgrade.integration.test.ts`: regenerate/supersede, latest-only regeneration, stopped partial text, rename ownership, title search escaping. Runs with `npm run test:aven` against a disposable database; **not run** in this pass. |

Browser acceptance checks (streaming, stop, switching, themes, mobile,
keyboard) were not executed automatically: they need a signed-in learner, a
database and real OpenAI calls.

## Known limitations

- Response feedback (thumbs up/down) is not implemented; there is no backend
  to store it, and the prompt marked it optional.
- After a proposal is created the server deliberately withholds further text
  until it verifies no change is described as applied; the UI shows
  "Preparing changes…" during that window instead of streaming.
- "Edit"/"Modify" on a proposal pre-fills the composer so the learner asks
  Aven for a revised proposal; there is no inline proposal editor.
- Goal progress cards are snapshots taken when Aven read the goal; the card
  links to the live goal page.
- Stopping a reply keeps the partial text on screen. The server persists the
  same text when its stream observes the cancellation; if it never does, a
  refreshed conversation shows "Reply stopped." instead.
