# ACADENCE — AVEN AI COMPANION
## Full Gap Analysis, Autonomous Agent Upgrade, Bug Fixing & Premium UI Redesign

You are acting as a Principal AI Systems Architect, Senior Full-Stack Engineer, Agentic AI Engineer, UX Architect, and Production Reliability Engineer.

Your assignment is to critically audit, diagnose, redesign, and substantially improve the existing **Aven AI Companion** inside my Acadence Learning Management System.

**This is an existing implementation, not a new project.**

Do not blindly rebuild everything. First inspect the actual codebase and identify what has been implemented, what is broken, what is missing, and which architectural decisions are preventing Aven from becoming a genuinely useful AI companion.

I have provided screenshots showing the current Aven interface. Use them as evidence for the UI problems, but investigate the repository and runtime behavior to establish the actual technical causes.

# 1. PRODUCT VISION — WHAT AVEN MUST BECOME

Aven must not be a basic chatbot that waits for students to type questions.

Aven should function as an intelligent, proactive, personalized learning companion and accountability assistant.

The experience should feel like having a supportive mentor who:

- Understands the student's learning goals.
- Knows their subjects and topics.
- Understands their study schedules.
- Tracks actual study progress.
- Recognizes missed sessions.
- Checks in naturally throughout the day.
- Reminds them of important commitments.
- Notices when they are falling behind.
- Helps them recover from missed work.
- Can modify their study planner through conversation.
- Can create and organize goals and tasks.
- Helps them prepare for exams and assignments.
- Offers useful next actions.
- Learns their preferences over time.
- Reduces the amount of manual planning required.

The central philosophy:

**Students should focus on studying. Aven should handle as much of the planning, organization, monitoring, and administrative work as possible.**

Aven must be proactive without being intrusive, and autonomous without making unauthorized or destructive changes.

---

# 2. MANDATORY GAP ANALYSIS BEFORE IMPLEMENTATION

Do not begin by changing random UI components.

First conduct a thorough audit of the existing Aven implementation.

Inspect:

1. Frontend components and state management.
2. Chat interface and message composer.
3. Conversation persistence.
4. OpenAI API integration.
5. AI model configuration.
6. Function calling and tool execution.
7. Authentication and user permissions.
8. AI onboarding and consent handling.
9. Reminder scheduling.
10. Notification delivery.
11. Study planner integration.
12. Goal and task integration.
13. User memory and personalization.
14. Database schema.
15. Background jobs.
16. Error handling.
17. Loading and streaming states.
18. API performance.
19. Mobile responsiveness.
20. AI cost controls.

Produce a detailed gap-analysis report.

For every identified issue, document:

- Current implementation.
- Expected behavior.
- Actual behavior.
- Root cause supported by code or runtime evidence.
- Severity: Critical, High, Medium, or Low.
- Affected files and services.
- Recommended solution.
- Implementation priority.
- Test required to prove the fix.

Classify issues as:

- Functional defects
- Missing product capabilities
- Architectural weaknesses
- UX/design problems
- Security/privacy problems
- Reliability/performance problems

Do not confuse an unimplemented feature with a broken feature.

Save the report as `docs/AVEN_GAP_ANALYSIS.md`.

After completing the audit, continue implementing the fixes in priority order.

---

# 3. CRITICAL BUG — AVEN CANNOT SEND MESSAGES

The current interface displays messages such as:

"Enable Aven to send messages. Review the privacy information above before enabling."

The message composer becomes unusable, and the user cannot interact naturally with Aven.

There is also an error:

"This service is temporarily unavailable. Your existing records are safe; please try again."

Investigate the complete chat request lifecycle.

Trace:

User input → Composer → Frontend state → API request → Authentication → AI service → OpenAI → Tool execution → Database persistence → Response streaming → UI rendering.

Check:

- Disabled composer conditions
- AI enablement state
- Consent persistence
- Incorrect authorization checks
- Failed API requests
- Missing environment variables
- Invalid model identifiers
- OpenAI SDK errors
- API quota or credit errors
- Network failures
- Database connection errors
- Conversation creation failures
- Streaming response parsing
- Stale frontend state
- Race conditions
- React component remounts

Fix the actual causes.

Requirements:

- Users must be able to send messages after initial onboarding is complete.
- The composer must remain available during normal operation.
- The Enter key should send a message.
- Shift+Enter should insert a newline.
- Prevent accidental duplicate submissions.
- Persist successful messages correctly.
- Support streaming responses.
- Display clear and actionable errors.
- Provide a retry option.
- Do not erase unsent user input after failure.
- Restore conversation history reliably after refresh.

If OpenAI is unavailable, distinguish the actual error category rather than displaying the same generic message for every failure.

Never expose API keys or sensitive server information in error messages.

---

# 4. REMOVE REPEATED AVEN ENABLEMENT

The current repeated "Enable Aven" experience is unacceptable.

Aven is a core part of Acadence, not an optional external chatbot that must be manually activated during every session.

Implement a one-time onboarding and permission flow.

## Desired behavior

When a user first accesses Aven:

1. Explain what Aven does.
2. Explain what relevant LMS information may be sent to OpenAI.
3. Allow the user to review privacy details.
4. Obtain and persist any required consent.
5. Allow the user to configure proactive notifications.
6. Complete onboarding.

After onboarding:

- Do not repeatedly display the enable banner.
- Do not require consent again for ordinary chat messages.
- Do not reset onboarding after refresh.
- Do not reset onboarding when starting a new conversation.
- Do not block chat because notification permission was denied.
- Do not confuse AI chat consent with browser notification permission.

Treat these as separate states:

- AI service availability
- AI data-processing consent
- Proactive reminder preferences
- Browser push permission
- Resource-access permission

For new users, Aven should be presented as an integrated part of Acadence, with a clear initial setup experience.

Respect legally required consent and allow users to revoke permissions.

Do not silently send personal records to OpenAI before the required consent has been obtained.

Once initial setup is complete, Aven should work naturally without repeated activation.

---

# 5. FIX THE ENTIRE CHAT USER EXPERIENCE

The current Aven chat looks unfinished and visually unbalanced.

Redesign it to feel like a premium AI product integrated into Acadence.

Use the existing design system and dark/light themes.

## 5.1 Layout

Create a clean layout with:

- Compact Aven header
- Optional collapsible conversation history
- Spacious but balanced chat area
- Properly aligned messages
- Sticky bottom composer
- Useful empty state
- Contextual suggestions
- Minimal visual clutter

Remove unnecessary banners, duplicated labels, oversized borders, and excessive empty space.

## 5.2 Composer

The composer must:

- Have a polished rounded appearance.
- Support multiline text.
- Expand naturally as the user types.
- Include a clearly visible send action.
- Remain fixed at the bottom of the conversation.
- Support keyboard shortcuts.
- Show a stop-generation action while streaming.
- Preserve text when a request fails.
- Never flash, jump, or disappear during updates.

## 5.3 Thinking and loading states

Do not change the Send button label to:

"Aven is thinking"

Do not place AI thinking indicators inside notification controls or unrelated UI elements.

Instead:

- Keep the Send button visually consistent.
- Replace Send with a Stop action while generating.
- Show a subtle assistant activity indicator inside the chat.
- Stream the response as it arrives.
- Show concise tool activity when appropriate.

Example:

Aven is checking your study schedule…

Aven found two sessions for tomorrow.

Aven is preparing a schedule change…

Avoid exposing raw internal reasoning.

Do not show endless loading states.

Ensure loading indicators are removed on success, error, cancellation, and timeout.

## 5.4 Conversation experience

Support:

- New conversations
- Persistent conversation history
- Conversation titles
- Conversation switching
- Conversation deletion
- Auto-scroll with user control
- Markdown rendering
- Code formatting
- Suggested actions
- Confirmation cards
- Inline error recovery
- Responsive mobile layout

Do not display raw JSON tool calls to students.

---

# 6. TURN AVEN INTO A REAL TOOL-USING AI AGENT

This is the most important architectural improvement.

Aven must be capable of taking meaningful actions inside Acadence through secure backend tools.

Use the official OpenAI Responses API with function calling or the current recommended supported agent architecture.

Do not assume that simply sending database information in the prompt makes Aven an agent.

Implement a proper tool-execution orchestration layer.

## 6.1 Read capabilities

Aven should be able to retrieve:

- Current user profile
- Subjects
- Topics
- Goals
- Milestones
- Tasks
- Study schedules
- Calendar events
- Study sessions
- Study duration
- Study streaks
- Upcoming assignments
- Upcoming exams
- Learning resources
- Relevant progress analytics
- Notification preferences

Always retrieve current records when answering questions requiring live LMS data.

Do not invent study hours, completed topics, or deadlines.

## 6.2 Action capabilities

Aven should be able to perform approved actions including:

- Create goals
- Edit goals
- Create milestones
- Create tasks
- Update task status
- Create study schedules
- Reschedule sessions
- Cancel sessions
- Add recurring study schedules
- Adjust study plans
- Create reminders
- Update reminder preferences
- Link tasks to subjects
- Organize learning resources
- Generate revision plans
- Create study checklists
- Propose recovery schedules

Implement these as explicit backend tools.

Do not give the model unrestricted database access.

Every tool must have validated inputs, authorization, predictable outputs, and audit logging.

---

# 7. NATURAL LANGUAGE STUDY PLANNER CONTROL

Aven must understand natural-language requests and translate them into real LMS actions.

## Example scenario

User:

"Can you move my sessions tomorrow to 9:30? I'm busy."

Expected behavior:

1. Determine the user's timezone.
2. Resolve tomorrow's date correctly.
3. Retrieve tomorrow's existing study sessions.
4. Identify the relevant sessions.
5. Determine whether 9:30 means AM or PM if context is insufficient.
6. Ask whether all sessions or only a specific session should move if ambiguous.
7. Preserve existing session durations unless instructed otherwise.
8. Detect conflicts and overlaps.
9. Present the proposed changes.
10. Request confirmation.
11. Execute the approved update.
12. Verify the saved database state.
13. Refresh the planner.
14. Respond with the actual result.

Example assistant response:

"I found two sessions tomorrow: Java Spring Boot at 10:00 AM and Docker at 3:00 PM. Do you want to move both sessions to start at 9:30 AM, one after the other, or just the Spring Boot session?"

Once clarified, show a confirmation card.

After approval, execute the update.

Do not claim success until the database operation succeeds.

## Additional examples

"Move my Java session to Friday."

"Cancel tomorrow's Docker session."

"Add two hours of Spring Boot study every weekday."

"Make me a schedule to finish this course in 20 days."

"I have an exam next Monday. Rearrange my study plan."

"I'm busy this evening. Move my sessions to tomorrow."

"Show me everything I missed this week."

"Reduce my daily study target to one hour."

"Create a goal to complete DevOps fundamentals this month."

"Add three tasks to my Spring Boot goal."

Aven should handle these requests through conversation without forcing the user to manually navigate multiple pages.

---

# 8. ACTION CONFIRMATION AND AUTONOMY LEVELS

Aven should minimize unnecessary confirmation dialogs without compromising user control.

Implement three action categories.

### Category A — Automatic read operations

No additional confirmation needed:

- Read schedules
- Read progress
- Read goals
- Read subjects
- Analyze study patterns
- Generate recommendations

### Category B — Low-risk automation

May execute automatically when the user has opted into the relevant behavior:

- Generate daily briefings
- Send study reminders
- Send check-ins
- Generate weekly summaries
- Update AI-generated recommendations
- Create private draft plans

### Category C — State-changing actions

Require explicit approval or an appropriate narrowly scoped prior authorization:

- Reschedule sessions
- Cancel study sessions
- Change goals
- Create recurring commitments
- Modify deadlines
- Delete records
- Change notification preferences

Destructive operations require explicit confirmation.

Never allow the AI to make unrestricted changes across the entire LMS.

Provide clear action previews, undo where feasible, and an audit trail.

---

# 9. AUTONOMOUS DAILY CHECK-IN ENGINE

Aven must be proactive.

Students should not need to open the chat and ask Aven to remind them every day.

Build a background scheduling and event-detection system.

The system must run independently of the browser being open.

## 9.1 Morning briefing

Aven should proactively review:

- Today's study sessions
- Goal deadlines
- Upcoming exams
- High-priority tasks
- Unfinished work

Send a concise personalized morning briefing at the configured time.

## 9.2 Study session reminders

Automatically detect upcoming study sessions.

Send reminders before sessions begin.

## 9.3 Missed session detection

If a session has not started after the configured grace period:

- Check actual session status.
- Check whether it was rescheduled.
- Check whether the user is already studying.
- Check whether the reminder was previously delivered.
- Send an appropriate reminder.
- Offer Start, Snooze, Reschedule, or Skip.

## 9.4 Randomized personal check-ins

This is an essential feature.

Aven should occasionally initiate natural conversations.

Examples:

"Hey! How's your day going? Did you get a chance to work on Spring Boot?"

"You've got your Docker session later. Need help preparing?"

"Looks like today's been busy. Want me to adjust your study plan?"

"How are you feeling about your upcoming exam?"

"You made good progress yesterday. Want to continue where you stopped?"

"Are you studying right now, or should we find a better time?"

These messages must feel contextual rather than repetitive.

Randomization must be bounded by:

- User's allowed notification hours
- Quiet hours
- Daily limits
- Recent notifications
- Current study activity
- User engagement
- Upcoming commitments

Do not spam students.

Do not assume a user is not studying merely because their timer is inactive.

## 9.5 Evening reflection

Optionally send:

"How did studying go today? Anything you want to change for tomorrow?"

Use the response to offer practical schedule adjustments.

## 9.6 Weekly accountability

Aven should proactively review:

- Weekly study hours
- Completed tasks
- Missed sessions
- Goal progress
- Upcoming deadlines
- Areas requiring attention

Offer a realistic plan for the next week.

---

# 10. PROACTIVE CONVERSATIONS MUST BE REAL CONVERSATIONS

A notification is not the same as a conversation.

When Aven sends a proactive message:

1. Create a properly scoped conversation event.
2. Persist the message.
3. Deliver the notification.
4. Allow the student to reply.
5. Load the relevant context.
6. Continue the conversation naturally.
7. Offer appropriate tools and actions.

Example:

Aven: "You missed your Java session. Want to move it?"

User: "Yes, tomorrow at 9."

Aven: "9 AM? Your Docker session starts at 10. Should I move Java to 9–10 AM?"

User: "Yes."

Aven executes the approved change and confirms the saved result.

Do not create disconnected notifications that cannot lead to actionable conversations.

Do not create a separate conversation thread for every minor reminder.

Use appropriate conversation grouping and notification deduplication.

---

# 11. GOAL-AWARE PERSONALIZED COACHING

Aven must integrate with the existing Goals system.

Example:

Goal: Become job-ready for a Java backend role in 30 days.

Aven should:

- Understand the goal.
- Read associated milestones.
- Identify unfinished tasks.
- Track progress.
- Identify upcoming deadlines.
- Recommend the next useful action.
- Suggest realistic study sessions.
- Notice when progress slows.
- Offer recovery plans.
- Encourage consistency.

Aven should not merely say:

"Keep going! You can do it!"

It should provide specific, evidence-based guidance.

Example:

"You have 12 days remaining. Your Spring Boot milestone is nearly complete, but your portfolio project has not started. I recommend prioritizing the project this week. Want me to prepare a schedule?"

Support academic, career, certification, and personal learning goals.

Do not promise external outcomes such as obtaining a job.

---

# 12. AVEN PERSONALITY AND COMMUNICATION

Aven should feel like a supportive, capable companion rather than a generic corporate assistant.

Personality:

- Friendly
- Encouraging
- Natural
- Intelligent
- Respectful
- Practical
- Context-aware
- Calm
- Nonjudgmental
- Concise by default

Avoid repetitive phrases and excessive enthusiasm.

Avoid generic motivational messages without useful context.

Do not pretend to have emotions, personal experiences, or knowledge that the system does not possess.

Aven should adapt to different students.

Some prefer gentle encouragement.

Others prefer direct accountability.

Allow simple coaching-style preferences.

Do not require users to configure dozens of settings before Aven becomes useful.

---

# 13. AI MEMORY AND CONTEXT

Implement reliable, user-scoped memory.

Aven should remember appropriate information such as:

- Current goals
- Preferred study times
- Preferred coaching style
- Current learning priorities
- Recurring study preferences
- Important user-approved plans
- Relevant past conversation decisions

Use the LMS database as the source of truth for schedules, progress, goals, and tasks.

Conversation memory must not override verified database state.

Do not send the entire database or conversation history to OpenAI for every message.

Use selective context retrieval and conversation summarization.

Allow users to inspect, correct, and delete AI-specific memories.

Enforce strict account isolation.

---

# 14. PREMIUM AVEN INTERFACE REDESIGN

Redesign the existing `/aven` page.

The experience should be comparable in polish and interaction quality to modern AI chat products, while retaining Acadence's identity.

## Recommended structure

### Header

Aven AI

"Your learning companion"

Include minimal actions:

- New conversation
- Conversation history
- Notification center
- Preferences

Avoid unnecessary tabs or repeated navigation elements.

### Conversation area

Use a clean, focused chat interface.

When empty, display:

"Good morning. What would you like to work on today?"

Below it, show context-aware suggestions:

- Plan my day
- Review my goals
- Help me study
- Adjust my schedule

These suggestions must perform real actions.

### Chat messages

Use clearly differentiated user and assistant messages.

Support:

- Streaming responses
- Tool activity indicators
- Action confirmation cards
- Schedule previews
- Goal summaries
- Inline task suggestions
- Retry controls
- Appropriate timestamps

### Composer

Keep it sticky at the bottom.

Avoid unnecessary borders and stacked labels.

Show a subtle assistant activity indicator within the conversation, not inside the Send button.

### Notifications

Use a dedicated, polished notification center.

Do not mix raw scheduler events with chat loading states.

### Preferences

Keep settings simple.

Advanced controls can remain behind expandable sections.

Use the existing Acadence typography, colors, component library, spacing, and responsive behavior.

Support both dark and light themes.

---

# 15. BACKGROUND JOB ARCHITECTURE

Inspect the existing deployment environment.

Implement reliable scheduled jobs using supported infrastructure such as Upstash QStash, Trigger.dev, a worker service, or an appropriate existing scheduler.

Do not introduce infrastructure unnecessarily.

Requirements:

- Reliable scheduled execution
- Per-user timezone support
- Retry handling
- Idempotency
- Duplicate prevention
- Quiet-hour enforcement
- Delivery logging
- Rate limits
- Notification preferences
- Failure recovery
- Usage monitoring

Use deterministic logic for routine scheduling and reminders.

Use OpenAI when contextual language generation or reasoning adds meaningful value.

The system should not make an expensive AI call every minute for every user.

Ensure scheduled jobs can operate when no browser session is open.

---

# 16. PERFORMANCE AND COST OPTIMIZATION

The initial application has a limited OpenAI API budget.

Optimize for affordability.

Requirements:

- Use economical models for everyday interactions.
- Use stronger models selectively for complex planning.
- Configure model identifiers through environment variables.
- Verify model availability and pricing.
- Use token limits.
- Minimize repeated context.
- Cache appropriate reusable results.
- Avoid unnecessary LLM calls.
- Track usage per user.
- Enforce server-side budgets.
- Prevent runaway tool loops.
- Prevent duplicate background invocations.

Do not claim that a displayed shared AI budget equals the actual OpenAI account balance unless it is connected to verified billing data.

The AI should remain helpful even when generation is temporarily unavailable.

Ordinary study reminders must continue working without OpenAI.

---

# 17. RELIABILITY, SECURITY AND PRIVACY

Implement production-grade protections.

- Authenticate every request.
- Authorize every tool operation.
- Validate tool inputs.
- Enforce user ownership.
- Prevent cross-account data access.
- Protect API keys.
- Prevent prompt injection from documents and messages.
- Use safe tool execution limits.
- Prevent duplicate mutations.
- Use transactions where appropriate.
- Keep an audit trail of AI actions.
- Handle OpenAI failures gracefully.
- Preserve conversation history.
- Respect user notification and privacy choices.

Never claim an action was completed before verifying the backend result.

If an action fails, tell the user what failed and provide a recovery path.

---

# 18. END-TO-END TEST SCENARIOS

Do not consider this task complete until the following scenarios pass.

### Test A — First-time onboarding

A new student opens Aven.

They complete initial privacy onboarding.

Aven becomes usable.

Refreshing the page does not trigger onboarding again.

### Test B — Normal conversation

The student types:

"What's your name?"

Aven responds normally.

The message is persisted.

The conversation remains after refresh.

### Test C — Study schedule retrieval

The student asks:

"What am I studying tomorrow?"

Aven retrieves actual schedules and answers correctly.

### Test D — Rescheduling

The student says:

"Move my tomorrow sessions to 9:30."

Aven identifies ambiguity, asks clarification, previews the proposed changes, obtains approval, executes them, and verifies persistence.

### Test E — Missed study session

A scheduled session is not started.

The system detects the missed start.

A reminder is delivered once.

The user can respond and reschedule.

### Test F — Random check-in

The user has enabled proactive check-ins.

Aven sends a contextual message within the allowed time window.

The message is stored.

The user can reply and continue the conversation.

### Test G — Loading state

The student sends a message.

A subtle thinking/activity indicator appears in the conversation.

The Send button does not display "Aven is thinking."

No unrelated UI elements change.

### Test H — OpenAI unavailable

The OpenAI request fails.

The app displays a clear error.

The user's message is preserved.

The user can retry.

Existing LMS functionality continues operating.

### Test I — Account isolation

Two students have separate conversations, schedules, and goals.

Aven never exposes one student's private data to the other.

### Test J — Database consistency

An AI-approved schedule change is persisted.

Refreshing the planner immediately shows the correct updated session.

The old session does not reappear.

---

# 19. REQUIRED DELIVERABLES

Complete the work in this order:

**Stage 1: Gap analysis**

Inspect the codebase and document every significant weakness.

**Stage 2: Critical bug fixes**

Fix chat sending, consent persistence, API failures, loading states, and conversation reliability.

**Stage 3: Agent architecture**

Implement secure tool calling and natural-language LMS operations.

**Stage 4: Proactive companion**

Implement scheduled reminders, randomized check-ins, conversational notifications, and goal-aware coaching.

**Stage 5: Premium redesign**

Redesign Aven's interface to meet the existing Acadence design standards.

**Stage 6: Testing and verification**

Run type checks, linting, tests, production build, and relevant end-to-end tests.

Provide a final report containing:

1. Gap-analysis findings.
2. Root causes of existing bugs.
3. Files changed.
4. Database changes.
5. New AI tools.
6. Autonomous workflows implemented.
7. Notification infrastructure.
8. Required environment variables.
9. Tests executed and results.
10. Remaining limitations and deployment steps.

Do not mark features as complete unless they have been implemented and verified.

Do not substitute mock responses for real AI integration.

Do not use arbitrary delays to hide broken state management.

Do not break existing LMS features.

Do not stop after producing the analysis report. Continue implementing the prioritized improvements unless a genuine external dependency blocks progress.

# FINAL PRODUCT STANDARD

Aven must evolve from a passive chatbot into a reliable, proactive, tool-using AI learning companion.

A student should be able to say:

"I'm busy tomorrow. Rearrange my study sessions and help me stay on track."

Aven should understand the request, inspect the real schedule, ask only necessary clarifying questions, prepare a valid change, obtain the appropriate approval, execute it, and confirm the result.

Aven should also independently detect upcoming sessions, missed commitments, and goals requiring attention, then provide useful reminders and personalized support within the student's preferences.

**The goal is to remove unnecessary administrative effort from studying, not introduce another system that students must constantly manage.**

Make Aven a defining feature of Acadence.