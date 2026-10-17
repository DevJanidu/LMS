# Aven latency report — 2026-10-18

## Method

- **Instrumentation.** `src/lib/aven/latency.ts` adds high-resolution stage timings
  (`performance.now()`) to every turn, logged once as structured JSON
  (`event: "aven_latency"`) with no message content: model, effort, tokens, cached
  tokens, and the stage marks below.
- **Benchmark.** `scripts/bench-aven-latency.mjs` drives real turns through a running app
  and summarises client timings plus the server's `aven_latency` logs as p50/p95.
- **Environment.** The app ran locally (`next dev`) against the **development** Neon
  database (`us-east-2`). The model was a deterministic mock answering in ~0.2 s, so
  measurements isolate Acadence's own pipeline.
- **Samples.** 5 isolated learners × 4 turns = 20 per run, after a warm-up.
- **Network.** One database round trip from this machine measured **~260 ms**.
  Production on Vercel's default region `iad1` sits much closer to `us-east-2`, so
  absolute production numbers will be far lower. The number of sequential round trips is
  the same everywhere, and that is what was reduced.
- **Production logs.** None were available: the Hobby plan keeps 1 hour, and there were
  no Aven turns in that window.

## Results (same machine, database, mock and request shape)

| Stage (ms) | Before p50 | Before p95 | After p50 | After p95 |
| --- | --- | --- | --- | --- |
| auth | 275 | 311 | 296 | 310 |
| preferences + goals → one context read | 2,200 + 1,836 | 2,241 + 2,197 | **289** | 297 |
| reserve usage | 2,329 | 3,199 | **1,444** | 1,470 |
| begin turn | 2,618 | 2,921 | 2,027 | 2,332 |
| access checks before first model call | 2,112 | 2,487 | **0** (skipped, just verified) | 0 |
| **first text at client** | **11,504** | **12,533** | **4,070** | **4,399** |
| full turn (client) | 14,114 | 14,862 | 6,392 | 8,571 |
| model (mock) | 202 | 233 | 192 | 214 |

**Time to first text: −65% at p50 and p95.**

Sequential database statements before the first model request went from **about 23 to
about 15**:

| Step | Before | After |
| --- | --- | --- |
| auth | 1 | 1 |
| context | 2 (preferences batch + goals) | 1 |
| reserve | 8 | 5 |
| begin turn | ~10 | ~8 |
| access checks | 2 | 0 |

## What changed

1. **One context query.** Account status, consent, model settings, timezone, five memories
   and five active goals are read together (`getChatContext`). The chat path no longer
   computes monthly usage totals or the global sum over all accounts' usage.
2. **Pooled connection for that read.** The first read on a fresh HTTPS connection cost
   ~2.2 s from here versus 264 ms warm, and server execution is 0.15 ms. Moving it to the
   WebSocket pool the following transactions already use means one connection setup per
   cold turn instead of two. The app-wide fetch fast path is unchanged.
3. **Reservation transaction from 8 to 5 statements.** Both advisory locks are in one
   statement (order kept), and the duplicate, account and global checks are in one
   SELECT.
4. **Turn start, two statements fewer.** The message and its reply row are inserted
   together, and history and message count come from one read.
5. **Access checks, one query instead of two, never redundant.** `assertTurnActive`
   combines account, consent and lease. It is skipped for the first model round only when
   preparation verified all three less than 2 s earlier, and it still runs before every
   later round and every data-tool call. Presentation tools touch no records and skip it.
6. **Notification and stored-reference lookups** run in parallel.
7. **Prompt caching.** Static instructions, rules, block guidance and the detail level
   come first, and a stable `prompt_cache_key` is sent per model, tool set and detail
   level. The key identifies no student.
8. **Cost accuracy.** Cached tokens are recorded and billed at the cached price.

## Prompt caching findings (real API, both models)

- **Identical requests:** about 99.9% of input tokens cached on the second call (1,483 of
  1,486, and 3,989 of 3,992 with tools).
- **A request that extends an earlier full prompt** (a longer conversation, or a later
  tool round): about 98% cached (1,355 of 1,380, then 1,377 of 1,398).
- **Same instructions, different tail:** 0 cached, whether the tail differed inside the
  instructions or as a separate developer message.

So caching works by an earlier complete prompt being a prefix of a later one.

- **Within a turn:** each tool round extends the previous one with identical
  instructions, so later rounds should be largely cached. This is inferred from the
  extension test above, not measured inside Aven.
- **Across turns:** no hits yet. The instructions carry per-turn values (verified request
  time, notification context, turn guidance), so the previous prompt isn't a prefix of
  the next. Enabling it means re-sending each earlier turn's volatile context in the
  history so the prefix stays byte-identical. That is the main remaining caching
  opportunity: about 4,000 instruction and tool tokens per turn at 5% of the price. On
  Sol that is ≈ $0.0076 saved per turn, and it would cut time to first token.

## Real model latency (direct API, short prompts)

These are not Aven turns. Streaming time to first byte was ~0.6 s (Luna) and ~0.9 s (Sol)
with a strict tool. With Aven's ~1,500-token instructions: first byte 1.3–2.1 s on Luna and
0.7–1.7 s on Sol.

## Remaining bottlenecks

- **Turn-start transaction:** about 8 statements over a WebSocket. Could shrink further
  with a stored procedure or combined CTEs.
- **Persisting the reply:** about 6 statements after the last token. The student doesn't
  wait on it, but it delays readiness for the next message.
- **The global monthly budget check** still sums every account's usage rows in one query
  per reservation. As usage grows, a maintained monthly counter or an index on `day`
  (needs a migration) would keep it constant-time.
- **Cross-turn prompt caching,** described above.
- **Region:** not pinned in `vercel.json`, so it defaults to `iad1`, near Neon
  `us-east-2`. No change is recommended without production measurements.
