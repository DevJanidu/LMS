# Aven streaming test report — 2026-10-17

Branch: `feature/aven-streaming-experience` (from `develop`).

## Static checks

- **TypeScript (`tsc --noEmit`):** no errors in any Aven file, test or spec. The repository
  still reports pre-existing errors in the notification work on `develop` (commit
  `98df669`: `NotificationInbox`, `useViewedNotifications`, notification tests). Those
  files import exports that do not exist on `develop`. They are unrelated to this change
  and were not modified.
- **ESLint** on `src/components/aven`, `src/lib/aven`, `src/app/api/aven`, the new tests
  and the mock provider: clean.

## Unit tests (Vitest)

All non-integration suites except the pre-existing broken notification suites:
**68 files, 584 tests passed.**

The 5 notification suites (`notifications`, `notification-ui`, `notification-client`,
`notification-read-operation`, `social-notification-read`) fail on `develop` for the
reason above.

New tests are in `tests/aven-streaming.test.tsx` (26) and `tests/aven-chat.test.ts` (2
added, 7 updated).

| Area | Covered |
| --- | --- |
| Relay | Ordered sequence numbers; protocol version; UTF-8; idempotent close; heartbeats on a timer; **cancelled stream detaches without stopping emission** |
| Protocol | Duplicate and out-of-order events dropped; malformed or unknown events rejected; activity categories user-safe; **idle watchdog ends a silent connection** (`StreamIdle`) |
| Generation state | Queued/running only under a live lease; **stale or taken-over lease → failed `generationInterrupted`**; completed, waiting for approval, cancelled, failed with code |
| Registry | Unknown type, newer version, invalid IDs and missing fields rejected; placeholders cannot carry data; legacy `goalCards` migration; slot ordering; late placeholder ignored; removal |
| Builders | Cards only from verified tool output; error output yields nothing; analytics/coverage/tasks/leaderboard shapes; completed tasks excluded; comparison only with prior records |
| Rendering | Placeholder → validated card (server-rendered HTML) |
| Markdown | Nested lists; checklists; partial table rows and lone headers held; unmatched `**`, backtick and `*` closed while streaming; code fences untouched; unclosed fence stays code; stable-prefix split never inside a fence; **raw HTML and `javascript:` links rendered inert**; streaming caret only while streaming |
| Recovery | Newer snapshot applied, stale ignored; refresh never rolls back live text; poll backoff; smoothing never splits surrogate pairs |
| `streamChat` | **Viewer cancels the stream before the reply → reply still generated and saved `complete`**; snapshot carries the stream sequence; **lease lost (stopped from another tab) → provider request aborted, saved `cancelled` with the partial text**; components emitted (loading → ready, empty placeholder removed) and saved versioned; tool-start and tool-result events |

## Browser tests (Playwright, real stack, mocked model)

`tests/e2e/aven-streaming.spec.ts` ran against `next dev` on the **development** database.
The dev server pointed `AVEN_PROVIDER_URL` at `scripts/mock-openai-provider.mjs`, a
deterministic model that streams about 7 s of Markdown and counts requests. Everything
except the model was real:

- route and `after()`
- lease
- snapshots
- status endpoint
- persistence
- usage accounting

A fixture learner was created for the run. Its rows were deleted afterwards (verified:
`0` leftover fixture users).

Browser: installed Google Chrome (`PLAYWRIGHT_CHANNEL=chrome`).

**Result: 9 passed (4.9 min).**

| # | Scenario | Assertions |
| --- | --- | --- |
| 1 | Live streaming | User message immediate; composer cleared; text grows while `data-streaming`; settles; table, nested list, 2 checkboxes, code block rendered; 1 model request; **reload shows the completed reply at once with no streaming or entrance replay** |
| 2 | Navigate to Subjects mid-reply and back | View follows the still-running reply to completion; reply text appears exactly once; **1 model request** |
| 3 | Refresh mid-stream | Partial snapshot shown, generation continues to completion; no duplicate text; 1 request |
| 4 | Hidden tab and 3 s offline | Recovers after visibility returns and the network comes back; no duplicates; not stuck; 1 request |
| 5 | Two tabs, one conversation | Second tab follows the running reply; **stop in tab 2 ends it in tab 1**; text stops changing afterwards; 1 request |
| 6 | Tool workflow | Real `tool-start` activity ("Reviewing your study history…") shown; study-time card rendered; card survives a refresh |
| 7 | Close the chat and return after 65 s | Finished reply rendered immediately; no stop button, no animation replay |
| 8 | Credits | One usage record per turn, all request IDs unique (7 turns → 7 rows); only the turn stopped mid-stream keeps its conservative reservation (existing billing policy for unknown usage) |
| 9 | Mobile (375 px), reduced motion | Streams and settles; no horizontal overflow |

The browser run found and fixed three defects:

- Strict Mode cancelled the conversation load, so the view stayed on its skeleton.
- The reply row shared the user message's transaction timestamp, so it could sort above
  the message.
- On finish, following ended before the final refresh, which briefly showed a settled but
  truncated reply.

## Performance

Markdown cost while streaming an 11 KB reply in 24-character frames (460 frames, Node):

- **0.122 ms per frame** with a full re-parse.
- **0.104 ms per frame** with the stable-prefix split (prefix re-parsed 141 times).

Parsing was never the bottleneck. The rendering saving comes from memoized blocks: blocks
whose source has not changed are skipped by React, so each frame re-renders only the
trailing block. Deltas are batched once per animation frame.

Recovery cost:

- **Polling:** 1 status request per second, only while a reply runs and the page is
  visible. Polling stops when the reply ends; errors back off up to 10 s.
- **Snapshots:** at most one write per 700 ms per running reply, plus one per tool or card
  event.

## Not verified

- **Real model streaming end-to-end.** The model ID was verified against the API, but
  browser runs used the mock to stay deterministic and cost-free.
- **Dark theme.** Acadence's dark mode is a class set by its own theme setting, and the
  run emulated only the `prefers-color-scheme` media query. Cards use theme tokens only,
  but they were not visually checked in dark mode.
- **Tablet viewport.** Not run; desktop (1280 px) and phone (375 px) were.
- **A real serverless deployment.** `after()` was exercised under `next dev`. On Vercel it
  maps to `waitUntil` and is bounded by `maxDuration = 120`.

## Re-running

```
node scripts/mock-openai-provider.mjs 4010
# second shell
$env:AVEN_PROVIDER_URL='http://127.0.0.1:4010/v1/responses'; $env:APP_URL='http://localhost:3100'; npx next dev -p 3100
# third shell
$env:PLAYWRIGHT_CHANNEL='chrome'; $env:PLAYWRIGHT_EXTERNAL_SERVER='1'; $env:APP_URL='http://localhost:3100'; $env:AVEN_E2E_PROVIDER='http://127.0.0.1:4010'; npx playwright test tests/e2e/aven-streaming.spec.ts --workers=1
```
