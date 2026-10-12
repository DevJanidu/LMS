# Goals and Aven implementation

## Delivered behavior

Aven chat now fills the available viewport, has a persistent collapsible conversation sidebar, a compact composer pinned below the message area, Enter/Shift+Enter shortcuts, and preserves the reading position while streaming. The shared budget and reminder setup are visible in the chat toolbar. Choose Enable study reminders to activate supportive morning/random/evening/weekly check-ins, schedule reminders, goal deadline nudges, and in-app delivery with quiet hours and a six-notification daily cap. This notification cap is separate from chat access.

The default goal interface now asks only for a goal title and due date. Goals can be marked complete or reopened with explicit user confirmation recorded as outcome evidence, and Aven can propose a simple goal through `proposeGoal`. Advanced data remains preserved; older goals with tasks expose their existing study plan as an optional section. Chat no longer renders a conversation-memory panel; conversation summaries still support background continuity. Aven replies align at the start of the chat and user replies at the end.

Authenticated learners have `/goals`, `/goals/[id]`, and `/aven`, accessible through the existing navigation. Goals support categories, priorities, statuses, dates, motivation, success criteria, linked subjects/topics/resources, milestones, task dependencies, recurring task activity, reflections, explicit outcome evidence, and allocated verified study sessions. Search, status filtering, pagination, summary statistics, history, progress snapshots, next actions, and dashboard priorities use persisted account data.

Progress supports weighted tasks, time, quantity, outcome, and hybrid modes. Outcome preparation cannot claim success without explicit confirmation. Allocating a study session cannot double-count its verified duration across goals; shortened or discarded sessions reduce derived progress. Dependency cycles and blocked completion are rejected. Changes use version checks, transaction locks, and idempotent operation receipts. The existing planner, timer, subject, topic, and resource records remain the source of truth.

Aven supports streaming chat, persisted conversations, older-message pagination, background conversation summaries, user-managed memory, coaching and study preferences, SMART plans, resource assistance, goal recovery, and realistic scheduling around existing commitments. Its 18 account-scoped tools read actual learning records or create pending proposals. Every AI mutation requires a review card and explicit approval; approval revalidates ownership, versions, dependencies, calendar conflicts, and capacity in a transaction. Repeated approval cannot duplicate writes. Approval decisions also leave a minimal audit event independent of chat deletion.

The library changes include icon actions, list/grid preference, resource-specific previews, server search, and numbered pagination. Calendar month/year selection and planner time dropdowns use themed controls; weekly repetition has select all, and scheduled subject blocks inherit subject color.

## Database

`drizzle/0006_goals_and_aven.sql` adds 23 tables: ten goal tables and thirteen Aven/preferences/notification tables. The migration includes foreign keys, account scoping, dependency links, mutation receipts, progress snapshots, proposal approvals, usage reservations, delivery leases, and deduplication indexes. It was applied successfully to the configured database; the migration ledger now contains seven migrations. Run `npm run db:migrate` on any other deployment database before releasing this code. Do not edit an already applied migration.

## APIs and services

| Endpoint | Behavior |
| --- | --- |
| `GET /api/goals` | Paginated goals, owned detail, or linked learning references |
| `POST /api/goals` | Validated, versioned, idempotent goal mutations |
| `GET /api/aven` | Preferences/conversations, or owned chat history with optional `before` message cursor |
| `POST /api/aven` | Preferences, memory, summaries, or conversation deletion |
| `POST /api/aven/chat` | Authenticated server-sent events from the OpenAI Responses API |
| `GET/POST /api/aven/proposals` | Owned proposals and explicit approve/reject |
| `GET/POST /api/aven/notifications` | Paginated delivery history and read/skip/reschedule actions |
| `POST /api/aven/push` | Register/remove owned push subscriptions |
| `GET /api/cron/aven` | Bearer-authenticated reminder generation and durable delivery worker |

Implementations live in `src/lib/goals`, `src/lib/aven`, their matching feature components, and API route folders. Browser mutations require the configured application origin and bounded JSON bodies. APIs return private, non-cacheable responses. External document fetching allows only public HTTPS, pins DNS, rejects redirects and internal addresses, and bounds payload/time. PDF reading is consent-gated, private-storage backed, limited to 5 MB and 100,000 input tokens, and budget checked. Provider keys never reach client bundles.

## AI configuration

Set `OPENAI_API_KEY` in your private `.env.local` for local development and in Vercel's Production environment for the live app. Restart local development or redeploy after changing environment variables. Never put the key in a `NEXT_PUBLIC_*` variable, source control, a screenshot, or chat. The default chat model (`gpt-4.1-mini`), planning model (`gpt-4.1-mini`), their documented prices, and the usage limits are now built in; an API key alone enables the default configuration. Enable AI consent in Aven preferences and save before sending a message.

Run `npm run check:aven` to validate loaded local configuration without printing secrets. Use `npm run check:aven -- --env=.env.production` to inspect only that file, or add `--connections` to make read-only model-access checks against OpenAI. This does not generate paid tokens. A successful metadata check confirms model access, but a real chat still needs available project billing and compatible Responses permissions.

Optional server-side overrides:

```text
OPENAI_API_KEY
OPENAI_CHAT_MODEL
OPENAI_PLANNING_MODEL
OPENAI_CHAT_INPUT_PRICE
OPENAI_CHAT_OUTPUT_PRICE
OPENAI_PLANNING_INPUT_PRICE
OPENAI_PLANNING_OUTPUT_PRICE
AVEN_DAILY_BUDGET_USD
AVEN_MONTHLY_BUDGET_USD
AVEN_GLOBAL_MONTHLY_BUDGET_USD
AVEN_DAILY_TOKEN_LIMIT
AVEN_MONTHLY_TOKEN_LIMIT
```

Prices are USD per million tokens, used for conservative per-account reservations and settlement from actual API usage. `.env.example` gives `gpt-4.1-mini` for routine conversation and `gpt-4.1-mini` for planning. Custom model names must supply both corresponding prices; Aven never guesses their cost. Verify current prices against [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) and [planning model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini) before deployment. The shared application budget defaults to $5/month across all learners, enforced with a global transaction lock and conservative reservations. Account monthly limits also default to $5. Daily dollar limits and optional token allowances default to zero (disabled), so there is no daily chat allowance; the five-request-per-minute admission limit remains. Set `AVEN_GLOBAL_MONTHLY_BUDGET_USD` to change the whole-app cap. Existing provider charges outside Aven and taxes are outside this application ledger. Unknown provider usage retains its reservation rather than claiming a free failed request. Known rejected PDF requests release unused reservations. Conversations have bounded context/output, at most six tool calls, a server timeout, and five-request-per-minute admission limits. Authentication, quota, model-access, and request-schema failures now have separate safe UI messages and sanitized server diagnostics.

Users must explicitly enable AI consent. Resource content has a separate consent toggle. Notes and bounded public link text can be read; PDFs are summarized through the Responses file input API after an exact input-token count. Saved documents, summaries, and memories are treated as untrusted data. Aven reports unavailable material instead of inventing content or citations.

No paid OpenAI calls were made during implementation. Chat/provider behavior was tested with isolated mocks; real credentials and a production smoke test remain external setup.

## External scheduler and notifications

Use the cron-job.org job already created:

1. Deploy this code and ensure the database migration is applied.
2. Set `CRON_SECRET` to a random secret of at least 32 characters in the deployment.
3. Set URL `https://acadence.janidudev.com/api/cron/aven`, method `GET`, schedule every five minutes (`*/5 * * * *`).
4. Under Advanced, set request header `Authorization` to `Bearer <the exact CRON_SECRET>`.
5. Run a manual test. Expect HTTP 200 with `processed`, `generated`, and delivery counts. An empty opted-in population legitimately returns zero counts. HTTP 401 means the authorization header/secret is incorrect; HTTP 404 means this endpoint is not deployed.
6. Enable the job and failure alerts, then verify its execution history. Re-enable it if repeated pre-deployment failures caused automatic disabling. Never put the secret in a URL or screenshot.

The worker runs independently of OpenAI. It supports upcoming goal/task deadline nudges, local-time morning briefings, upcoming sessions, missed starts, bounded randomized check-ins, evening reflections, weekly reviews, inactivity recovery, and approved custom reminders. It respects opt-in, per-goal reminder settings for goal messages, quiet hours, daily caps, and snooze. Session reminders with a zero-minute lead fire in the next five-minute scheduling window. Missed-start detection uses actual timer/session evidence and does not claim to measure attention. Notification actions reuse the planner to skip/reschedule a single occurrence.

Generation has account locks and unique event keys; external delivery uses leases, bounded exponential retries, and an eight-attempt ceiling. In-app notifications work without email/push credentials. Email requires `RESEND_API_KEY` and a verified `EMAIL_FROM`. Browser push requires HTTPS, browser permission, and `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; generate a stable pair once with `node scripts/generate-vapid.mjs` and store the private key only on the server. Private VAPID credentials have been generated in both local environment files without printing them. Copy all three VAPID variables to Vercel Production to enable deployed browser push; local files do not update Vercel. Register push from Aven preferences, grant browser permission, and save the enabled preferences. A provider accepting a push/email does not prove the recipient viewed it.

See [cron-job.org FAQ](https://cron-job.org/en/faq/) for request limits and automatic disabling. The worker batches twelve accounts and four delivery records per invocation with bounded execution; a growing population needs more frequent invocations or a dedicated queue worker. This is an explicit deployment capacity limit, not a promise that every account is serviced every five minutes at arbitrary scale. Keep the existing daily Vercel maintenance jobs.

## Verification

Completed checks include full repository unit tests (305 passed, 28 integration tests skipped by default), thirteen analytics tests, translation key parity, TypeScript, ESLint, production build, and Drizzle migration consistency. Ten database integration tests passed against disposable, uniquely identified fixture accounts, covering CRUD, dependency blocking, conflict/idempotency behavior, verified allocation, outcome evidence, privacy, atomic approval/rollback, persisted chat, and overlapping reminder workers. Additional targeted database reruns verified older-message pagination, editable summary ownership, approval audit persistence, and the final scheduler query changes. Fixture data was removed afterward.

Real-browser QA exercised goal/milestone/task CRUD, reload persistence, optimistic completion, streamed mock AI responses with real approval transactions, preferences, cross-user access denial, cron authentication, and 375px mobile layouts in light/dark mode without overflow or page errors. Paid provider requests were intercepted only in the QA runner; production has no fake AI implementation.

Current browser checks run against the local development server with real authenticated fixture accounts and intercepted AI responses. Live production chat, email delivery, and device push delivery still need smoke tests after deployment.

To rerun database integration tests, use a disposable Neon branch with `TEST_DATABASE_URL` and `TEST_DATABASE_ISOLATED=true`, then run `npx vitest run tests/goals-aven.integration.test.ts`. `TEST_DATABASE_FIXTURES_ONLY=true` additionally enables explicitly scoped fixture testing; do not point general destructive test suites at production. The fixtures create and delete only their own random account IDs.

## External setup and practical limits

OpenAI model-access checks succeeded with the privately configured API key. Email delivery, real browser push delivery, deployed AI requests, and the external scheduler still require production smoke tests. Goal management and ordinary planner functionality work without AI credentials.

The existing LMS has no assignments module; Aven's assignments tool explicitly reports that absence. Video transcripts, non-PDF document extraction, authenticated/private third-party web pages, and OCR are unsupported; Aven discloses unread content. PDF summaries do not represent an exhaustive transcript. Resource selectors initially expose the latest 200 owned resources; the library itself searches and paginates the full collection. The conversation sidebar shows the latest 50 conversations, while individual message history supports pagination. New translation keys exist in all four dictionaries; most new feature prose currently uses English fallback copy and still needs fluent Arabic, German, and Spanish translation. Recurring task activity records habits rather than automatically completing a task or inflating quantity progress. AI planning quality and model-account compatibility require a real-provider smoke test after credentials are added.

The chat layout and reminder setup passed browser checks at desktop and 375px mobile widths. Three targeted database tests verified shared-budget concurrency, recommended check-in preferences with deduplicated goal notifications, and overlapping missed-session workers. No paid OpenAI calls were needed.

Simple-goal QA verified the two-field manual form, completion/reopening across reloads, simple detail view, absence of chat memory controls, and sender bubble alignment. A real database test verified proposal approval, deadline persistence, explicit completion evidence, reopening, and cross-account completion denial.

The inline Aven goal assistant also supports follow-up replies in the same persisted conversation, so a learner can answer a missing-detail question before approving the proposed goal.

## Account timezone correction

Migration `0007_account_timezone_mode.sql` adds automatic device timezone selection. Existing non-UTC timezone choices remain manual; legacy UTC defaults become automatic. The shared local/production database migration was applied successfully. Automatic detection persists the active browser timezone so calendar display, date boundaries, analytics, and background reminders agree. Settings offers Automatic (use my device) or a manual searchable selector covering all available Intl/IANA zones, including an explicit UTC override. Timezone changes invalidate account calendar/analytics caches and remount the calendar to discard stale ranges. Stored study sessions and schedule instants remain unchanged.

The calendar intentionally renders projected local wall time in FullCalendar's UTC grid; swapping its internal grid directly to local time would apply offsets twice. Regression tests cover half-hour/quarter-hour offsets, positive/negative day boundaries, and northern/southern daylight-saving offsets.
