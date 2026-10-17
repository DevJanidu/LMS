# Aven streaming architecture

How an Aven reply travels from the model to the screen, and how it survives the student
leaving: switching tabs, navigating, refreshing, losing the network, or watching from a
second tab.

## Root cause of the "stuck generating" bug

Two separate defects produced the symptom.

1. **Navigation cancelled the reply.** `useAvenStream` aborted its `fetch` when the chat
   unmounted. The chat route tied generation to `request.signal`
   (`AbortSignal.any([request.signal, …])`) and its stream's `cancel()` aborted
   generation too. Leaving the page therefore cancelled the turn. If the serverless
   invocation was frozen first, the conversation lease (`locked_until`, 130 s) stayed set,
   so the next message failed with `conversationBusy`. The UI showed neither state, because
   "generating" existed only in React memory.
2. **A dead connection was indistinguishable from a slow one.** The SSE stream had no
   heartbeat. After a tab freeze or a half-open connection, `reader.read()` stayed pending
   forever and the view stayed in "generating".

A third problem appeared during browser verification and is fixed too. In development,
React Strict Mode's simulated unmount fired `useAvenConversation`'s abort-on-unmount
cleanup. That cancelled the only conversation load, so a conversation opened from the URL
stayed on its skeleton.

## Pipeline

```
OpenAI Responses API (stream: true)
  → chat.ts: provider events mapped onto the typed protocol
  → stream-relay.ts: sequence numbers, heartbeat, detachable SSE
  → /api/aven/chat (POST, text/event-stream)
  → useAvenStream: sequence guard, idle watchdog, rAF-batched text
  → AvenMessage: smoothed text → incremental Markdown → generative UI
```

The model output is real provider streaming (`response.output_text.delta`). Nothing is
buffered to fake typing. `useSmoothText` only paces text that has already arrived and
returns the full text the moment streaming ends.

## Durable execution model

| Concern | Mechanism |
| --- | --- |
| Run independently of the viewer | The route starts `streamChat` and registers it with `after()`, which uses the platform's `waitUntil`. The generation's only signals are a 110 s timeout and an explicit stop. `maxDuration` is 120 s, so the run always fits inside the invocation. |
| Generation record | The assistant reply row (`ai_messages`, unique per conversation, request and role) is created as `streaming` with `phase: queued` in the same transaction that takes the lease. It holds `seq`, `activity`, `updatedAt` and `components` in `context`. |
| Generation ID / idempotency key | The client-generated `requestId`. A repeated submission is rejected with `duplicateRequest` (409). Usage is reserved once per `(user, requestId)`. |
| Status | `generation-state.ts` derives `queued`, `running`, `waiting_for_approval`, `completed`, `failed` or `cancelled` from the reply row, the lease and the pending proposals. |
| Snapshots | Every 700 ms while text streams, and immediately at tool start, tool result and card changes. Each write is fenced by the lease (`active_request_id = requestId`). |
| Cancellation | `/api/aven/chat/cancel` finishes the turn as `cancelled` and releases the lease. The running generation's next snapshot write then affects zero rows, and it aborts itself. This works from any tab or device. |
| Stale detection | A `streaming` row whose request no longer holds a live lease reports `failed` with `generationInterrupted`. The next turn converts it to an error row and keeps any partial text. |
| Timeouts | 110 s generation timeout (saved as `cancelled` with `generationTimedOut`), 130 s lease, 25 s client idle watchdog, 8 s server heartbeat. |

**Why not a job queue.** A turn is bounded at 110 s, and `after()` reliably covers that
inside the existing invocation. Vercel Queues or Workflow would add infrastructure and
per-step costs without a correctness gain for a bounded turn. If a crash still kills a
run, stale detection turns it into a visible, retryable error instead of a hang. If turns
ever need to outlive one invocation, the generation record and fenced snapshots are
already the state a durable worker would need.

**Why polling rather than a resumable event stream.** Serverless instances share no
memory, so a reconnecting SSE endpoint would itself have to poll the database. The client
polls `GET /api/aven/chat/status` directly (one owned conversation row, one reply row and
one proposal count) at 1 s while visible, backing off to 10 s on errors. It pauses while
the page is hidden or offline, and only while a generation is active. This avoids
long-lived invocations that cost money while the student is away.

## Recovery flow (client)

1. On mount, or when a conversation opens, `GET /api/aven?conversation=` returns messages
   plus `generation`.
2. If `generation` is `queued` or `running` and this tab has no live stream,
   `useGenerationFollow` polls the status endpoint and applies snapshots with
   `applySnapshot`. Newer-by-sequence wins, so text is never duplicated or rolled back.
3. On a terminal status, one full refresh swaps in the final reply, cards, proposals and
   state together. If that refresh fails, following still ends, so the view cannot stay
   "generating".
4. `visibilitychange`, `pageshow` (bfcache) and `online` resume polling immediately, and
   trigger a throttled (5 s) refresh when idle. Background timers are never relied on.
5. A live stream that breaks (network loss, idle watchdog) refreshes the conversation.
   If the server is still running, step 2 takes over.
6. Switching conversations mid-reply detaches the stream (`stream.detach()`) instead of
   blocking or cancelling.
7. `BroadcastChannel("aven:<userId>")` tells other tabs when a turn starts or ends. The
   message only triggers a refresh; the server remains the source of truth.

Completed messages present when a conversation opens render instantly. Only messages that
arrive afterwards animate in, and restored history never replays typing.

## Files

- `src/lib/aven/stream-protocol.ts`: event types, constants, sequence guard
- `src/lib/aven/stream-relay.ts`: SSE relay with heartbeat and detach
- `src/lib/aven/generation-state.ts`: durable state machine
- `src/lib/aven/activity.ts`: user-safe activity categories
- `src/lib/aven/chat.ts`: provider mapping, snapshots, components
- `src/lib/aven/conversations.ts`: queued record, fenced snapshot, status query
- `src/app/api/aven/chat/status/route.ts`: recovery endpoint
- `src/components/aven/useAvenStream.ts`: live stream, watchdog, detach
- `src/components/aven/useGenerationFollow.ts`: follow, resume, multi-tab
- `src/components/aven/useAvenConversation.ts`: sequence-aware reconciliation
- `src/lib/aven/configuration.ts`: `AVEN_PROVIDER_URL`, a loopback-only test override that is ignored in production

## Model

`OPENAI_CHAT_MODEL` and `OPENAI_PLANNING_MODEL` are both `gpt-6-luna`. On 2026-10-17 it
was verified against the API (`GET /v1/models/gpt-6-luna` → 200, `object: model`). Keys
stay server-side, and the browser only talks to Acadence routes.
