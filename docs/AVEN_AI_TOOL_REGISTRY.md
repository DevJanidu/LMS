# Aven tool registry

Source: `src/lib/aven/tools.ts`. It has **45 tools: 19 read and 26 proposal.** The list
below was generated from the registry; `tests/aven-tools.test.ts` asserts the count.

Every tool works the same way:

- strict JSON schema (`strict: true`, every field required or nullable)
- zod validation on the server
- `userId` taken from the authenticated session; no tool accepts a user ID
- an account lookup that rejects inactive and non-learner accounts
- an audit log row (`aven.tool`) for each call

Read tools run immediately. Proposal tools only store an `ai_plan_proposals` row. The
change happens when the student approves the card (`POST /api/aven/proposals`), through
the service listed. Generic SQL, shell, HTTP or file tools don't exist.

## Read tools (19)

| Tool | Returns | Notes |
|---|---|---|
| getUserProfile | name, timezone, verified streak and minutes, coaching preferences, active timer | A timer is "not proof of focused study". |
| getNotificationPreferences | reminder settings | |
| getCalendar | occurrences in a date range (≤ 366 days, ≤ 100 returned) with attendance | Account timezone. |
| getStudySchedule | next 1–14 days | |
| getStudyHistory | ≤ 100 valid sessions in 1–30 days with totals | |
| getWeeklyAnalytics | this week plus the previous week, with a `comparable` flag | |
| getUserGoals | paged goals with progress | |
| getGoalDetails / getGoalProgress | one owned goal | |
| getGoalHealth | onTrack / needsAttention / atRisk, with rule reasons | `learning/goal-health.ts` |
| getLearningGaps | ranked findings (critical → low) | `learning/gaps.ts` |
| auditTopicCoverage | coverage counts and lists for one subject | Never computes mastery. |
| getNextBestAction | deterministic ranking with reasons | |
| getSubjects / getTopics | owned subjects and topics | |
| getUpcomingDeadlines | subject, topic and goal dates | |
| getAssignments | always `available: false` | There's no assignments module. |
| getStudyResources | resource list, or processed content with consent | Content is untrusted data. |
| getStudyCircles | privacy-filtered leaderboard snapshot | Verified timer time only. |
| listReminders | pending one-off reminders | |

## Proposal tools (26)

| Tool | Proposal kind | Applied by |
|---|---|---|
| proposeGoal / proposeGoalPlan / proposeGoalHierarchy | goalPlan | `mutateGoal` (transaction, duplicate protection, read-back) |
| completeGoal | goalCompletion | `mutateGoal` |
| createGoalMilestone / createGoalTask / updateGoalTask | milestoneCreate / taskCreate / taskUpdate | `mutateGoal` |
| **manageGoal** | goalChanges: update or delete the goal; update, delete or reorder milestones; complete, reopen, reschedule, update or delete tasks | `mutateGoal` per step, versioned; a goal deletion is high impact |
| **manageSubjects** | workspace: create, update, archive, restore or delete | workspace `mutate()` with preconditions; a subject deletion is high impact |
| **manageTopics** | workspace: create, update, complete, reopen or delete | workspace `mutate()` |
| **manageLibrary** | workspace: add an http(s) link or delete a resource | workspace `mutate()` |
| organizeLearningResource | resourceOrganization | hash-checked update |
| createStudySchedule | calendarCreate (once, daily or weekly; conflicts checked first) | `mutateCalendar` |
| moveStudySessions / cancelStudySessions / rescheduleStudySession | calendarChanges / reschedule (scope one, future or all) | `mutateCalendar` |
| proposeStudySchedule | schedule (goal catch-up) | validated, then `mutateCalendar` per session, then read back |
| **scheduleStudySessions** | schedule (several subjects in a window) | same as above |
| proposePracticeSessions | schedule with `recommendationKey` | same as above |
| recordLearningSignal | learningSignal | `saveLearningSignal` (ownership-checked) |
| updateStudyPreferences / updateReminderPreferences | preference patch | upsert, undoable |
| rememberPreference | memory | at most 50 entries |
| createReminder | reminder | `scheduled_check_ins` |
| **cancelReminders** | cancelReminders | update only pending manual reminders; stale reminders → conflict |

Bold tools are new in this change.

## Safety properties enforced in code

- **Tool subsets:** each turn offers a subset (`planTurn`). A call to a tool that wasn't
  offered is refused with `invalidTool` before validation or execution.
- **Workspace operations:** limited to subjects, topics, link resources and their
  deletions. Profile, settings, user-status, timer, session and file operations are
  rejected by the proposal schema.
- **Goal changes:** limited to goal, deleteGoal, milestone, deleteMilestone, task and
  deleteTask. Activity and session-link actions are rejected.
- **Limits:** at most 6 provider rounds and 6 tool calls per turn, a 64 KB argument cap and
  an 8 KB tool-output cap. Repeated identical calls in a turn return the cached result.
