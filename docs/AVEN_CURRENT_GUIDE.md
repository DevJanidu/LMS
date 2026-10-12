# Aven: current features, operation, and OpenAI configuration

Prepared: 12 October 2026. Repository baseline: `f4a0527`.

This document describes the implementation currently present in Acadence, checked against its source code and release reports. Model and budget settings come from the local configuration supplied by the owner. They do not establish which settings or commit are running on the production website. No credentials are included here.

## 1. What Aven is

Aven is Acadence's AI learning and goals companion. Learners can use it to understand their saved study activity, create goals, break work into tasks, plan study sessions, adjust schedules, and receive reminders.

Its personalized answers use account-owned Acadence records through server tools. OpenAI generates conversational explanations and chooses tools; Acadence retrieves records, validates proposals, applies approved changes, and runs reminders.

Aven's interface and replies are English-only. Dates and study schedules still follow the learner's account timezone.

## 2. Current OpenAI model

| Purpose | Configured model | Selection |
| --- | --- | --- |
| Routine conversation | `gpt-4.1-mini` | `OPENAI_CHAT_MODEL` |
| Planning conversation and goal assistant | `gpt-4.1-mini` | `OPENAI_PLANNING_MODEL` |
| PDF resource summarization | `gpt-4.1-mini` | Uses the chat model configuration |
| Conversation summaries | Model selected for that conversation turn | Runs within the chat request when needed |

Chat and planning have separate configuration slots, but both currently select the same model. Planning does not automatically switch to a larger model. The goal editor's assistant explicitly requests planning mode; the Aven page initially enables planning for plan, recovery, and schedule intents.

Aven calls the **OpenAI Responses API**, using server-side requests to `https://api.openai.com/v1/responses`. Conversation generation streams results. Requests set `store: false`; Acadence persists its own conversation records. This setting should not be described as a guarantee that OpenAI has no processing or operational retention.

OpenAI documents GPT-4.1 mini as a smaller, faster GPT-4.1 model supporting streaming, function calling, and structured outputs. It accepts text and image input and produces text. Its model-level context window is 1,047,576 tokens, with up to 32,768 output tokens and a June 2024 knowledge cutoff. Aven imposes much smaller application limits, described below. These model capabilities do not mean Aven has implemented image chat or voice. [Official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

The configuration uses the `gpt-4.1-mini` alias rather than the explicitly dated `gpt-4.1-mini-2025-04-14` snapshot.

### Prices and local budget settings

The configured standard rates are **$0.40 per million input tokens** and **$1.60 per million output tokens**, for both chat and planning. OpenAI also lists a $0.10 cached-input rate; Aven's current cost calculation uses its configured input/output rates without a separate cached-input discount. [Official OpenAI model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

| Setting | Current value | Meaning |
| --- | --- | --- |
| `AVEN_DAILY_BUDGET_USD` | `0` | Daily dollar cap disabled |
| `AVEN_MONTHLY_BUDGET_USD` | `5` | Monthly cap for each learner |
| `AVEN_GLOBAL_MONTHLY_BUDGET_USD` | `5` | Shared monthly cap across all learners |
| `AVEN_DAILY_TOKEN_LIMIT` | `0` | Daily token cap disabled |
| `AVEN_MONTHLY_TOKEN_LIMIT` | `0` | Monthly token cap disabled |

Zero disables the corresponding optional limit; it does not disable Aven. The shared $5 cap still applies. All learners draw from that same application allowance, even though each account also has a $5 monthly cap.

For illustration, 10,000 input tokens plus 2,000 output tokens costs approximately **$0.0072** at these rates. A conversation turn can involve multiple provider requests and repeated context, so this is not a fixed price per message.

The displayed budget is Acadence's usage ledger, including conservative reservations. It is not the OpenAI account balance and does not include provider usage outside Aven or taxes. Budget periods use the database's calendar-month accounting; they are not individual subscription billing cycles.

## 3. How a conversation works

1. **The learner enables Aven.** One-time onboarding records AI consent and a separate reminder choice. Resource-content access and push permission have their own controls.
2. **The learner sends a message.** The request can identify a conversation, goal, planning mode, retry, or notification being answered.
3. **The server checks access and reserves usage.** Authentication, account ownership, consent, request validation, rate limits, and remaining budget are checked before generation.
4. **Aven assembles bounded context.** It supplies recent successful messages, a saved conversation summary, study preferences, limited memory excerpts, verified time/timezone, and relevant notification snapshots. It does not load the entire account into every prompt.
5. **OpenAI requests tools when needed.** The server validates tool arguments and retrieves owned records, such as upcoming sessions or goal progress. Read tools provide current facts; change tools save approval proposals.
6. **The interface displays the answer and proposals.** Normal replies stream. Pending-change responses receive additional handling to reduce unsupported claims that a proposed change has already happened.
7. **The learner reviews changes.** Approve/reject cards control mutations. Approval rechecks current ownership, versions, and conflicts before committing a transaction.
8. **The server saves the result and settles usage.** Known token usage replaces the reservation. When provider usage is uncertain, the conservative reservation remains counted.

Example: “Move tomorrow's Docker session to 7 PM.” Aven retrieves the actual calendar, identifies the occurrence, and produces a move proposal showing the old and new times. Approval applies the move while preserving duration and subject color. If the message says only “7,” Aven asks AM or PM before proposing a change.

## 4. Built conversation features

- A dedicated `/aven` workspace with Chat, Notifications, and Settings tabs.
- New conversations, selectable saved threads, older-history pagination, and conversation deletion.
- Remembered conversation selection and conversation links in the URL.
- Goal-specific conversations opened from goal cards and detail pages.
- An embedded smart goal assistant in the goal editor.
- Markdown replies, timestamps, user/assistant bubbles, and tool activity indicators.
- A persistent composer, draft preservation, retry, Stop, and interrupted-request recovery.
- Retry handling that can reuse the saved user message instead of creating a duplicate row.
- A collapsible conversation sidebar, responsive layout, and light/dark theme support.
- Budget and usage information in the workspace/settings.

Conversation summaries help maintain continuity as a thread grows. They remain AI-generated context; tools must verify current LMS facts again.

## 5. Goals and task support

Aven can propose a simple new goal or an update using a **title and due date**. It is instructed to ask only for essential missing information. Detailed milestones and task breakdowns are generated when the learner explicitly requests them.

Built capabilities include:

- Search and paginate owned goals.
- Retrieve goal details, progress, milestones, tasks, and recent activity.
- Read upcoming goal/task deadlines.
- Propose detailed goal plans with milestones and prerequisite dependencies.
- Propose task creation and updates.
- Propose a new milestone.
- Propose marking a goal complete or reopening it.
- Use existing subject/topic/resource references in plans.
- Suggest recovery steps when deadlines or routines need adjustment.

The underlying Goals feature tracks task dependencies, study evidence, progress, and history. Aven reads that system and submits supported changes through approval proposals. Editing a simple goal preserves existing tasks and milestones rather than replacing them with an unsolicited plan.

## 6. Calendar and study planning

Aven can read date-range calendar records and upcoming study schedules, then propose:

- A one-time study commitment.
- A weekly recurring commitment, including selected weekdays and an optional end date.
- A goal-based study schedule over a horizon of up to 14 days.
- A single-session move or a batch of up to 30 moves.
- Cancellation of one occurrence, future occurrences, or a whole series.
- A custom reminder.

Goal-based scheduling uses real commitments, allowed study days, the preferred study window, daily target minutes, remaining task effort, existing planned time, deadlines, and blocked-task dependencies. The scheduling algorithm searches available slots, generally uses blocks of up to 60 minutes with 15-minute gaps, and reports work that cannot fit. It creates at most 30 sessions per proposal.

Scheduling checks reject invalid times, overlaps, and excessive load where applicable. Different schedule creation paths have different bounds; the adaptive planner's block policy is not a universal limit on all calendar commitments.

Times are interpreted in the account timezone and stored as instants. Moving a recurring occurrence preserves its original occurrence identity. Aven asks for clarification when AM/PM or simultaneous-versus-sequential scheduling is ambiguous.

## 7. Attendance and saved study evidence

Aven now distinguishes planned sessions, reported attendance, and saved timer study.

- Dashboard and planner **Attend** actions record attendance for the exact occurrence.
- A subject-linked Attend action starts the matching subject/topic timer atomically.
- A title-only commitment opens Study so the learner can choose a subject.
- The Study dropdown can load real scheduled occurrences and fill their subject/topic.
- Finishing and saving the linked timer session marks attendance completed.
- Discarding or finishing under one minute does not invent completed study time; attendance remains attended.
- Skipping from a notification records a skip while retaining the calendar occurrence.

Attendance is available from 30 minutes before a session until 24 hours after its end. Matching includes the occurrence and start-time snapshot, so attendance at an old time does not automatically count after a move.

The calendar tools return attendance records and derived statuses. Aven is instructed to say **“no attendance recorded”** instead of asserting that the learner did not study. An active timer shows a started timer; attendance is a user report; completed attendance links to a saved session. None independently proves how focused the learner was.

## 8. Study history and personalized coaching

Aven can retrieve recent valid study sessions, subject/topic information, weekly study totals, current goal progress, profile information, and streak-related analytics.

Learners can select supportive, direct, or analytical coaching and save learning preferences. Aven uses this context to explain next actions, reflect on recorded activity, and suggest manageable recovery plans.

It is instructed to avoid shaming, fabricated success probabilities, invented study activity, and guarantees about external outcomes such as employment. It should identify missing or truncated records and base personalized factual claims on tool results.

## 9. Resources

Aven can list owned learning resources and, with separate permission, read supported resource content.

- Saved notes can provide learning context.
- Privately stored plain-text files can be read within bounded size and excerpt limits.
- Public HTTPS learning links can be fetched as bounded HTML/plain text.
- Privately stored PDFs can be processed into an AI-generated learning summary.
- Resource organization changes can propose a title and subject/topic assignment.
- Answers should cite processed sources returned by tools, rather than infer content from a resource title.

Link fetching rejects private/internal addresses, redirects, unsupported content types, credentials in URLs, and nonstandard ports. Payloads and request time are bounded. This is retrieval of saved learning links, not a general web search feature.

PDF processing is limited to 5 MB and 100,000 counted input tokens, requires resource access consent, and reserves its own paid usage. The result is a summary rather than an exhaustive transcript; visible page numbers may be cited. Resource text is treated as untrusted content, and cannot grant permissions or bypass approval.

## 10. Memory and settings

Aven supports explicit preference memory. A chat request to remember something creates an approval proposal. Settings also let the learner edit or delete memory and manage study, privacy, and reminder preferences directly.

Stored memory is treated as user-reported preference, not verified account state. A normal chat prompt includes only the latest five memory excerpts, each limited to 500 characters; memory is not unlimited recall.

Study preferences include coaching style, learning preferences, preferred study hours, study days, and a daily target of 15–240 minutes. Default study preferences are supportive coaching, weekdays, 17:00–20:00, and 90 minutes per day. These are defaults, not evidence of the current preferences of any particular learner.

## 11. Reminders and proactive conversations

The background scheduler supports session reminders, missing-attendance/skipped-session reminders, goal/task deadline reminders, morning prompts, evening reflections, weekly summaries, randomized check-ins, inactivity recovery prompts, and explicitly scheduled custom reminders.

Routine reminders use database records and templates: **they do not generate paid OpenAI replies**. Replying to a notification opens its related conversation; the conversational response then uses OpenAI under the normal budget.

Reminder delivery respects enabled preferences, account timezone, quiet hours, snooze, daily notification caps, spacing between messages, and current study activity. Attended/completed occurrences suppress session and missed-session reminders. Deduplication includes the start snapshot so a moved occurrence can receive a reminder at its new time.

Default reminder preferences have reminders disabled overall. When enabled, the default daily cap is three notifications, quiet hours are 22:00–07:00, session lead time is 15 minutes, and missed-session grace is 10 minutes. Morning, evening, weekly, and randomized modes are individually optional.

Notification actions include Start, Reply, Reschedule, Skip, and Snooze as applicable. Proactive events are grouped into conversations with relevant notification context. Weekly summaries use recorded study hours, completed-task timestamps, and actual deadlines.

### Delivery channels

| Channel | Requirements |
| --- | --- |
| In-app | Enabled in learner preferences |
| Browser push | Configured VAPID settings, service worker, browser permission, and a saved subscription |
| Email | Learner opt-in and valid Resend/sender configuration |

An external scheduler should invoke secured `GET /api/cron/aven` every five minutes using the configured bearer secret. Background jobs can run without the learner keeping a browser open. Email and push use persisted delivery records and retries; provider acknowledgement is required before marking delivery successful.

## 12. Approval, privacy, and limits

Every conversational change tool creates a reviewable proposal. The model cannot directly write goals, move sessions, or save preference changes. Proposals expire after 24 hours. Approval validates ownership and current versions, applies conflict checks, and commits supported changes transactionally. Cancellation has an additional confirmation dialog.

Undo exists for supported preference changes and schedule moves. It depends on unchanged versions and valid availability; past original times and destructive deletion are not silently restored. Recurring conflicts are checked for up to one year at approval.

Authentication and account scoping protect conversations, resources, proposals, and notification actions. Server mutations validate request origin and schemas. Keys stay server-side. Requests recheck access during generation/tool execution. Minimal audit records and anonymous cost/token records support accountability; usage accounting survives account deletion without retaining chat text or identity in those anonymized rows.

| Application control | Current bound |
| --- | --- |
| User message | 6,000 characters |
| Normal request input | 24,000 bytes, excluding separately bounded instructions/tool schemas |
| Instructions | 16,000 bytes |
| Output per provider response | 4,096 tokens |
| Tool executions per turn | At most six |
| Main provider request budget per turn | At most six; summary/correction requests share this bound |
| Generation timeout | 80 seconds |
| Usage reservation admission | Five per account per minute |

PDF work has separate measured-input limits. A turn may be refused while some nominal monthly allowance remains because it must reserve enough budget for its conservative maximum work. Unknown provider usage after interruption or failure can keep that reservation counted.

## 13. Current boundaries and deployment status

- There is no separate assignments or exams database module. The exposed assignments tool reports this limitation; Aven can offer existing goals/tasks instead.
- No general web search, voice conversation, or image-generation interface was found in the current Aven implementation.
- Persistent memory and chat context are bounded; Aven does not remember every historical fact indefinitely.
- Resource reading depends on permission, supported format, network access, and available budget.
- AI answers can still be mistaken. Current records and approval checks provide safeguards, not a guarantee of perfect interpretation.
- Deployment variables, database migrations, the external cron job, and channel permissions must be present in the target environment.
- Repository reports record passing build, lint, TypeScript, database, browser, and genuine OpenAI journeys. This documentation review did not rerun those tests or make paid requests.
- The prior release report explicitly leaves real email/browser-push delivery to a learner unverified in that run.
- The presence of this code locally does not establish that the latest commit is live on Vercel.

## 14. Example requests

| Learner request | Expected behavior |
| --- | --- |
| “Create a goal to finish my Docker course by 30 November.” | Prepare a simple goal approval card |
| “Break that goal into tasks and milestones.” | Retrieve the goal and propose a detailed plan |
| “What should I study tomorrow?” | Read actual schedule/goals and suggest next actions |
| “Schedule my goal tasks this week.” | Find available slots and propose sessions |
| “Move tomorrow's sessions to 7.” | Clarify AM/PM and sequencing before a move proposal |
| “How much did I study this week?” | Retrieve valid recorded study totals |
| “Why is this session marked missed?” | Read attendance and explain missing attendance without inventing activity |
| “Summarize my saved PDF.” | Check permission, resource ownership, input size, and budget, then summarize |
| “Remember that I prefer short sessions.” | Present an explicit memory proposal |
| “Turn off evening reminders.” | Present a reminder-preference proposal |

## 15. Source map

| Area | Primary repository sources |
| --- | --- |
| Chat orchestration and instructions | `src/lib/aven/chat.ts`, `src/lib/aven/context.ts` |
| Tool definitions and record retrieval | `src/lib/aven/tools.ts` |
| Proposal approval and undo | `src/lib/aven/proposals.ts`, `extra-proposals.ts`, `undo.ts` |
| Scheduling | `src/lib/aven/planning.ts`, `calendar-actions.ts` |
| Configuration and usage | `src/lib/aven/config.ts`, `configuration.ts`, `usage.ts`, `budget.ts` |
| Preferences and validation | `src/lib/aven/preferences.ts`, `validation.ts` |
| Resources | `src/lib/aven/documents.ts`, `resource-network.ts` |
| Reminders and delivery | `src/lib/aven/scheduler.ts`, `scheduler-model.ts`, `delivery.ts`, `proactive-conversations.ts` |
| User interface | `src/components/aven/` |
| Attendance | `src/lib/study/attendance.ts`, `attendance-model.ts` |
| Existing release evidence | `docs/AVEN_IMPLEMENTATION_REPORT.md`, `docs/STUDY_ATTENDANCE.md` |

Official external reference: [OpenAI GPT-4.1 mini documentation and pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini), accessed 12 October 2026.
