# ACADENCE — AVEN AI
## MASTER PROMPT 1: PREMIUM CONVERSATIONAL UI & UX REDESIGN

You are a Principal Frontend Architect, Senior Next.js Engineer, and world-class AI Product Designer.

Your assignment is to transform the existing Aven AI interface into a premium, highly responsive, ChatGPT-inspired conversational workspace.

This is an existing production-oriented application. Do not rebuild Acadence or replace working backend functionality.

### PRIMARY OBJECTIVE

Aven should feel like a sophisticated AI product, not a chatbot embedded inside a traditional dashboard.

The interface must be:

- Minimal and elegant
- Extremely responsive
- Smooth during AI streaming
- Easy to navigate
- Beautiful in dark and light themes
- Accessible
- Mobile-friendly
- Consistent with Acadence branding
- Capable of displaying real AI actions and proposals

Use ChatGPT as an interaction-quality reference, not as a source of branding, proprietary assets, or identical visual components.

---

## 1. REPOSITORY AUDIT

Inspect the existing Aven frontend.

Pay particular attention to:

- `src/components/aven/`
- `/aven` route
- Chat state management
- Conversation sidebar
- Streaming response handling
- Message persistence
- Tool activity indicators
- Approval cards
- Notification interfaces
- Settings and consent UI
- Existing design tokens
- Existing component library

Identify current problems before changing components.

Document the findings in `docs/AVEN_UI_AUDIT.md`.

Do not stop after the audit.

---

## 2. FULL-PAGE CONVERSATIONAL WORKSPACE

Redesign `/aven` using a full-height application layout.

### Sidebar

Include:

- Aven identity
- New conversation
- Search conversations
- Recent conversations
- Collapsible history
- Conversation rename
- Conversation deletion
- Selected conversation state

Keep the sidebar compact and elegant.

### Main area

Use a centered conversation column with a maximum width around 800px.

Remove unnecessary borders, oversized panels, duplicated headings, and excessive nested cards.

The main area should support:

- Welcome screen
- Conversation messages
- Structured action cards
- Tool activity indicators
- Smooth scrolling
- Sticky bottom composer

Do not introduce a second global navigation system that conflicts with Acadence's existing navigation.

---

## 3. PREMIUM WELCOME EXPERIENCE

When the conversation is empty, show a personalized greeting.

Example:

"Good evening. Ready to make some progress?"

Underneath, show the main message composer.

Add four intelligent suggestions:

- Plan my day
- Review my goals
- Organize my study schedule
- Help me learn

Suggestions must trigger real functionality.

If no goals exist, show an appropriate goal-creation suggestion.

Avoid fake personalized insights.

---

## 4. CHAT COMPOSER

Build a polished, multiline chat composer.

Requirements:

- Rounded appearance
- Subtle surface contrast
- Automatic textarea resizing
- Enter to send
- Shift+Enter for newline
- Clear send action
- Stop-generation action
- Keyboard accessibility
- Draft preservation
- Responsive mobile behavior
- Smooth focus transitions

The composer must not jump or disappear when streaming begins.

Never change the Send button label to "Aven is thinking."

Use a Stop icon during generation.

---

## 5. REAL-TIME STREAMING

Audit the existing streaming implementation.

Implement actual incremental rendering from OpenAI response events.

Requirements:

- Render user messages immediately.
- Show a subtle assistant activity indicator.
- Render text progressively as streamed deltas arrive.
- Avoid waiting for the complete response.
- Support smooth Markdown rendering.
- Avoid flickering and layout shifts.
- Avoid unnecessary rerenders.
- Support cancellation.
- Handle interrupted streams.
- Preserve conversation history.
- Prevent duplicate messages.

Do not simulate streaming with artificial character delays.

Batch rendering updates when appropriate.

Support intelligent auto-scroll that pauses when the user scrolls upward.

---

## 6. ASSISTANT ACTIVITY STATES

Display subtle inline status messages such as:

- Reviewing your goals…
- Checking your calendar…
- Preparing a study plan…
- Checking schedule conflicts…
- Preparing changes…
- Applying approved changes…

These must reflect actual backend events.

Do not expose hidden reasoning or raw tool arguments.

Do not display unrelated loading indicators in notification controls.

---

## 7. MESSAGE PRESENTATION

User messages:

- Right aligned
- Compact rounded surface
- Consistent spacing

Assistant messages:

- Left aligned
- Minimal visual background
- Clean typography
- Markdown support
- Code blocks
- Tables
- Links
- Structured action cards

Include:

- Copy message
- Regenerate response
- Retry failed response
- Optional feedback

Keep controls subtle.

---

## 8. STRUCTURED ACTION CARDS

Build reusable UI components for:

### Goal creation proposal

Show:

- Main goal
- Deadline
- Milestones
- Tasks
- Estimated workload
- Create / Edit / Cancel actions

### Study schedule proposal

Show:

- Subject
- Start date
- End date
- Start time
- End time
- Recurrence
- Conflicts
- Approve / Modify / Cancel

### Schedule change proposal

Show:

- Existing schedule
- Proposed schedule
- Affected occurrences
- Conflict warnings
- Confirmation action

### Goal progress card

Show:

- Goal title
- Progress
- Remaining milestones
- Next recommended task
- Target date

These components must consume validated structured data from the backend.

Never infer database mutations by parsing Markdown.

---

## 9. CONVERSATION MANAGEMENT

Implement:

- New conversations
- Conversation persistence
- Conversation search
- Rename
- Delete
- Conversation switching
- Pagination
- Retry
- Stop generation
- Scroll restoration
- Draft persistence

Ensure conversation switching does not cause unnecessary full-page reloads.

---

## 10. PROACTIVE MESSAGE UI

Aven should display proactive reminders as part of natural conversations.

Example:

"Your Java session starts in 15 minutes. Ready?"

Users should be able to respond directly.

Support contextual actions:

- Start studying
- Reschedule
- Snooze
- Skip
- Ask Aven

Do not display raw notification database records in the conversation.

---

## 11. NOTIFICATIONS AND SETTINGS

Move notifications into a clean notification center.

Move advanced preferences into a dedicated settings view or dialog.

Do not place large notification and settings tabs above the main chat.

Do not repeatedly show onboarding banners after consent has been saved.

Separate:

- AI processing consent
- Reminder preferences
- Browser notification permission
- Resource access permission

---

## 12. VISUAL DESIGN

Preserve Acadence's existing design system.

Use:

- Existing typography
- Existing spacing tokens
- Existing color palette
- Existing icon library
- Existing component library

Support light and dark themes.

Avoid:

- Rainbow colors
- Excessive gradients
- Oversized borders
- Unnecessary icons
- Cluttered dashboards
- Distracting animations

Use subtle transitions and respect reduced-motion preferences.

---

## 13. PERFORMANCE

Optimize:

- Time to first visible streamed content
- React rendering
- Conversation pagination
- Scroll performance
- Composer responsiveness
- Mobile scrolling
- Conversation switching
- Message persistence

Avoid unnecessary refetching.

Prevent duplicate requests.

Preserve existing server-side security.

---

## 14. ACCEPTANCE TESTS

Verify:

1. Empty chat screen.
2. Sending a message.
3. Progressive streaming.
4. Long Markdown response.
5. Stop generation.
6. Retry after failure.
7. Conversation switching.
8. Conversation persistence after refresh.
9. Goal approval card.
10. Schedule approval card.
11. Mobile viewport.
12. Light theme.
13. Dark theme.
14. Keyboard accessibility.
15. No duplicate messages.

Run lint, TypeScript checks, and production build.

---

## FINAL INSTRUCTIONS

Implement actual code changes.

Do not provide only a plan.

Do not introduce mock AI responses into production.

Do not break existing LMS functionality.

Preserve existing backend contracts unless a change is strictly necessary and documented.

At completion, report:

- Components changed
- UI improvements
- Streaming improvements
- Bugs fixed
- Tests executed
- Remaining limitations

**The final Aven interface must feel like a premium conversational AI workspace while retaining Acadence's own identity.**