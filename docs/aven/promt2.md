# ACADENCE — AVEN AI
## MASTER PROMPT 2: GPT-6 LUNA, INTELLIGENT GOALS & AGENTIC LMS OPERATIONS

You are a Principal AI Systems Architect, Senior Backend Engineer, PostgreSQL Architect, and AI Agent Engineer.

Your assignment is to upgrade the existing Aven backend into a sophisticated, tool-using learning agent.

Do not build a new application.

Reuse and improve the existing architecture.

### PRIMARY OBJECTIVE

Aven must understand natural-language intentions and convert them into useful, reliable LMS actions.

Students should be able to create goals, organize milestones, manage tasks, schedule study sessions, and adjust plans through conversation.

---

## 1. INSPECT THE EXISTING ARCHITECTURE

Review:

- `src/lib/aven/chat.ts`
- `src/lib/aven/context.ts`
- `src/lib/aven/tools.ts`
- `src/lib/aven/proposals.ts`
- `src/lib/aven/planning.ts`
- `src/lib/aven/config.ts`
- `src/lib/aven/usage.ts`
- Existing goal models
- Existing study planner
- Existing authentication
- Existing database schema

Verify actual repository paths before editing.

Document architectural gaps and missing functionality.

---

## 2. GPT-6 LUNA CONFIGURATION

The desired primary AI model is GPT-6 Luna.

Check official OpenAI API documentation and verify:

- Exact API model identifier
- Availability to the account
- Streaming support
- Function calling
- Structured outputs
- Token limits
- Pricing

Configure through:

`OPENAI_CHAT_MODEL`

`OPENAI_PLANNING_MODEL`

Use the verified GPT-6 Luna model for both chat and planning where supported.

Do not invent an API model identifier.

If unavailable, retain a working supported fallback and report the limitation.

Keep the existing OpenAI Responses API architecture.

---

## 3. ADVANCED INTENT UNDERSTANDING

Aven must recognize complex requests containing multiple goals, tasks, deadlines, and preferences.

Example:

"I want to find a Java backend or DevOps job within three months. First, I need to complete Core Java and Advanced Java. Then Spring Boot, Microservices, Docker, and DevOps."

Aven must extract:

- Main outcome goal
- Deadline
- Learning milestones
- Dependencies
- Suggested tasks
- Optional schedule
- Assumptions

Do not save the entire request as one simple goal.

Do not require the student to manually create each milestone.

---

## 4. HIERARCHICAL GOAL MANAGEMENT

Support:

**Primary Goal → Sub-goals / Milestones → Tasks → Study Sessions**

Example:

Primary goal:
Get a Java backend job.

Milestones:
1. Core Java
2. Advanced Java
3. Spring Boot
4. Microservices
5. DevOps
6. Portfolio and applications

Each milestone contains actionable tasks.

Reuse existing goal and milestone models.

Introduce parent-child goal relationships only if necessary.

Preserve existing records and migration compatibility.

---

## 5. CONVERSATIONAL GOAL CREATION

When Aven detects goal-setting intent:

1. Analyze the request.
2. Retrieve existing goals.
3. Identify duplicates.
4. Extract a proposed goal hierarchy.
5. Ask essential clarifying questions.
6. Show a structured proposal.
7. Ask whether to save it.
8. Persist the approved structure transactionally.
9. Verify persistence.
10. Refresh the Goals UI.

Example:

Aven:

"I've organized your three-month career goal into six milestones. Would you like me to save it?"

Actions:

- Create goal
- Edit plan
- Not now

Do not create duplicate goals during retries.

---

## 6. GOAL DECOMPOSITION ENGINE

Create a planning service that generates:

- Milestones
- Tasks
- Dependencies
- Estimated study hours
- Suggested deadlines
- Success criteria
- Recommended order
- Next best action

Use structured model outputs and server-side validation.

Consider:

- Existing subjects
- Existing topics
- Current goals
- User availability
- Study history
- Upcoming deadlines
- Prerequisites

Clearly distinguish AI suggestions from verified user information.

---

## 7. NATURAL-LANGUAGE STUDY PLANNER

Example:

"Add Java every day from 7 PM to 9 PM for the whole month."

Aven should:

1. Identify Java as the subject.
2. Resolve the month and date range.
3. Use the user's timezone.
4. Interpret daily recurrence.
5. Check existing calendar events.
6. Detect overlaps.
7. Prepare a schedule proposal.
8. Show a preview.
9. Request approval.
10. Save the recurring schedule.
11. Verify persistence.
12. Update the calendar.

Reuse existing recurrence infrastructure.

Do not create unnecessary duplicate rows.

---

## 8. NATURAL-LANGUAGE SCHEDULE MODIFICATION

Example:

"Move tomorrow's Java session to 9:30."

Aven must:

- Find the correct session.
- Clarify AM/PM when necessary.
- Preserve duration.
- Detect conflicts.
- Present proposed changes.
- Obtain approval.
- Execute the approved change.
- Verify persistence.
- Refresh the calendar.

For recurring events, distinguish:

- This occurrence
- This and future occurrences
- Entire series

Never silently modify an entire series.

---

## 9. MULTI-STEP TOOL ORCHESTRATION

Improve the existing tool-calling architecture.

Support:

- Intent classification
- Relevant context retrieval
- Multiple tool calls
- Structured proposals
- Approval handling
- Transactional execution
- Result verification
- Conversation continuation

Use bounded execution loops.

Avoid infinite retries and uncontrolled API spending.

For complex workflows, use durable job state where appropriate.

---

## 10. INTELLIGENT NEXT BEST ACTION

Build a recommendation engine that identifies the most useful next task.

Consider:

- Goal priority
- Deadline
- Remaining effort
- Dependencies
- Available time
- Recent activity
- User preferences

Example:

"Complete Spring Security next. It will unblock your portfolio API project."

Expose this through:

- Aven chat
- Goals dashboard
- Goal detail page
- Main Acadence dashboard

Use deterministic ranking where possible.

Use AI for contextual explanations when useful.

---

## 11. CONVERSATIONAL MEMORY

Aven should remember relevant user-approved context.

Examples:

- Long-term goals
- Current learning priorities
- Preferred study times
- Coaching preferences
- Approved plans

Use the LMS database as the source of truth.

Do not assume AI memory is always correct.

Implement efficient context retrieval and summarization.

Allow users to inspect, correct, and delete AI-specific memory.

---

## 12. SECURE ACTION EXECUTION

Implement narrowly scoped tools.

Examples:

- `getGoals`
- `getGoalDetails`
- `getSubjects`
- `getTopics`
- `getStudySchedule`
- `getStudyHistory`
- `proposeGoalHierarchy`
- `proposeStudySchedule`
- `proposeScheduleChange`
- `proposeTaskCreation`
- `getNextBestAction`

Every tool must enforce authentication, authorization, validation, and account ownership.

Read-only operations may execute automatically.

State-changing operations require appropriate approval.

Never give the model unrestricted database access.

Never claim a mutation succeeded before the backend verifies it.

---

## 13. COST AND RELIABILITY

Implement:

- Configurable model selection
- Per-user AI budgets
- Global safety budget
- Token tracking
- Rate limiting
- Tool execution limits
- Request timeouts
- Retry handling
- Provider error classification
- Conversation persistence

Avoid sending complete database records on every request.

Use relevant context only.

Preserve the existing application if OpenAI becomes unavailable.

---

## 14. ACCEPTANCE TESTS

Test:

1. Extracting multiple milestones from one user message.
2. Creating a hierarchical goal proposal.
3. Editing the proposal.
4. Approving and saving the hierarchy.
5. Preventing duplicate goals.
6. Creating recurring daily study sessions.
7. Detecting calendar conflicts.
8. Editing one recurring occurrence.
9. Editing an entire series.
10. Retrieving actual study history.
11. Generating Next Best Action recommendations.
12. Conversation persistence.
13. Tool authorization.
14. Budget enforcement.
15. OpenAI failure recovery.

Use mocked provider responses for automated tests.

Use controlled real API tests only when authorized and configured.

---

## FINAL INSTRUCTIONS

Implement the upgrades directly in the existing repository.

Do not stop after writing a design document.

Preserve working features.

Run type checks, linting, database tests, integration tests, and production build.

Report:

- Architecture changes
- Database migrations
- New tools
- AI model configuration
- Goal workflows
- Scheduling workflows
- Tests and results
- Remaining deployment requirements

**Aven must become a reliable conversational interface for managing the entire Acadence learning journey.**