# Aven models, reasoning and response detail

## Verified API configuration (2026-10-18)

Checked against the live OpenAI API with the configured key: free `GET /v1/models/{id}`
lookups plus minimal requests with at most 16 output tokens each. Prices come from
OpenAI's official pricing page (developers.openai.com/api/docs/pricing), standard tier.

| Display name | API model | Exists | Reasoning efforts accepted | Verbosity | Streaming + strict tools | Price per 1M tokens (input / cached / output) |
| --- | --- | --- | --- | --- | --- | --- |
| **GPT-6.1 Sol** (default) | `gpt-6.1-sol` | yes | low, medium, high, xhigh, max | low, medium, high | yes | $2.00 / $0.10 / $10.00 |
| **GPT-6 Luna** | `gpt-6-luna` | yes | none, low, medium, high, xhigh, max | low, medium, high | yes | $0.10 / $0.01 / $0.50 |

Rejected values return `400 unsupported_value` and name the supported set: Sol rejects
`none` and `minimal`; Luna rejects `minimal`. Also listed by the API but not used:
`gpt-6-sol`, `gpt-6-astra`, `gpt-5.6-sol` and `gpt-5.6-luna`.

**Sol costs 20× Luna per token.** It is the default because that was requested, but plan
allowances (Pro $3/month, Plus $6/month) go much less far on Sol. Measure real usage
before enabling paid checkout.

## How a choice becomes an API request

```
browser: { model: "sol" | "luna", reasoning: auto|quick|balanced|deep|extended, detail: concise|balanced|detailed, interactive }
  → chatSchema (keys only, Zod)
  → resolveModelChoice (models.ts): registry + verified capabilities + plan allowance
      → { apiModel, effort, verbosity, prices }   or 400 modelUnavailable / reasoningUnsupported
  → reserveUsage with that model's prices (and the plan budget when billing is on)
  → Responses API: model, reasoning.effort, text.verbosity, prompt_cache_key
  → reply saved with { model, modelLabel, apiModel, reasoning, effort, detail }
```

- **No silent substitution.** If the selected model is unavailable, or the reasoning mode
  isn't supported by it, the request is refused with a clear message. A reply's label
  always names the model that answered.
- **The browser never sends an API model ID.** Unknown keys are rejected with 400.
- **Display names map to configuration.** `AVEN_SOL_MODEL` defaults to `gpt-6.1-sol`;
  `AVEN_LUNA_MODEL` defaults to `OPENAI_CHAT_MODEL`, then `gpt-6-luna`.
- **Unknown models are handled conservatively.** A configured model not in the verified
  capability table gets only low, medium and high, uses no native verbosity, and is
  unavailable until a price is configured (`AVEN_<KEY>_INPUT_PRICE` /
  `_OUTPUT_PRICE` / `_CACHED_INPUT_PRICE`).
- **Background jobs are unaffected.** Documents and proactive jobs keep the operator's
  `OPENAI_CHAT_MODEL` / `OPENAI_PLANNING_MODEL` configuration.

## Reasoning modes

| Mode | Sol | Luna | Notes |
| --- | --- | --- | --- |
| Auto (default) | low–high | none–high | Chosen per request by a deterministic heuristic, with no extra model call (see below). Never picks extended. |
| Quick | low | none | The lightest effort the model accepts |
| Balanced | medium | medium | |
| Deep | high | high | |
| Extended | xhigh | xhigh | Offered only when the model supports `xhigh` |

The `max` effort is accepted by both models but deliberately not offered.

**How Auto picks an effort** (`autoEffort`):

| Request | Target effort |
| --- | --- |
| Greeting | none (Sol's lightest is low) |
| Planning or multi-part request, or debugging, proof, algorithm or architecture wording | high |
| Explanation ("explain", "how", "why", "what is") | medium |
| Short request or interactive block | low |

No reasoning content is ever shown. The UI shows only the existing activity labels for
real tool events.

## Response detail

Detail controls presentation, not reasoning. Each level sets the native `text.verbosity`
(concise → low, balanced → medium, detailed → high; both models support it) and adds a
short, static instruction. In "detailed" that instruction asks for steps, examples, a
diagram where useful, and practice questions.

## Interface

`AvenModelMenu`, in the Aven top bar, uses the existing Radix Popover:

- **Model:** both models with description, a "Recommended" badge, a selection check, and
  a disabled state with its reason.
- **Reasoning:** the five modes; unsupported modes are disabled with "Not supported by …".
- **Response detail:** a segmented control.
- **Capabilities, real ones only:**
  - Acadence workspace (always on)
  - Learning resources (shows the privacy setting; links to settings)
  - Interactive responses (a toggle that removes the block tools from requests)
  - Web research is not shown, because no web tool exists.
- **Keyboard:** every choice is a native radio (arrow keys, Space) and Escape closes the
  menu. It works at 375 px and in dark mode.
- **Saving:** settings are saved per student (`ai_user_preferences.value`, no migration)
  and also sent with each chat request, so a change applies to the next message even
  before the save finishes. A failed save rolls back with a notice.
- **Labels:** every reply shows "GPT-6.1 Sol", or "GPT-6 Luna · Deep" when the mode isn't
  Auto. History is kept when switching models.

## Plans and cost controls

- **Model access by plan.** `PlanEntitlements.aiModels` lists the models each plan may
  use; both models are on the paid plans. It only applies when `BILLING_ENFORCEMENT=on`.
- **Plan budgets are now enforced.** With billing on, `aiMonthlyBudgetUsd` lowers the
  per-account monthly cap at reservation time. Before this change it was displayed but
  never applied.
- **Accurate settlement.** Usage is settled at the answering model's prices, and cached
  input is billed at the cached rate (previously charged as full input).
- **Unchanged limits.** The existing per-request reservation, per-minute rate limit, and
  daily, monthly and global caps all still apply. The proposed Rs. 900 / 1,600 / 2,400
  tiers are not hard-coded, and existing pricing is unchanged.

## New environment variables (all optional)

| Variable | Default | Purpose |
| --- | --- | --- |
| `AVEN_SOL_MODEL` | `gpt-6.1-sol` | API model behind "GPT-6.1 Sol" |
| `AVEN_LUNA_MODEL` | `OPENAI_CHAT_MODEL` → `gpt-6-luna` | API model behind "GPT-6 Luna" |
| `AVEN_SOL_INPUT_PRICE`, `AVEN_SOL_OUTPUT_PRICE`, `AVEN_SOL_CACHED_INPUT_PRICE` | verified table | Prices for an unlisted model (USD per 1M tokens) |
| `AVEN_LUNA_INPUT_PRICE`, `AVEN_LUNA_OUTPUT_PRICE`, `AVEN_LUNA_CACHED_INPUT_PRICE` | verified table | Same, for Luna |
