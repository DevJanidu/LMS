# Aven commands and mentions

All of this is implemented. Code: `src/lib/aven/commands.ts` (registry, shared by client
and server), `orchestration.ts` (routing), `mentions.ts` (resolver) and
`src/components/aven/AvenComposer.tsx` (UI).

## Slash commands

| Command | Workflow | Tools added to core reads* | Example |
|---|---|---|---|
| `/plan` | plan | goal hierarchy, goal, plan, milestone, task, next action, deadlines, schedules, goal health | `/plan become a backend engineer by March` |
| `/schedule` | schedule | scheduleStudySessions, createStudySchedule, practice, move, cancel, reschedule, schedule reads, topics, coverage, reminders | `/schedule @Advanced Java next week after 7 PM` |
| `/catchup` | catchup | gaps, goal health, goal details, catch-up schedule, practice, schedule, next action, move, coverage, manageGoal | `/catchup @SQL` |
| `/review` | review | goal health, gaps, weekly analytics, history, goal progress and details, coverage, next action | `/review @Become a Backend Engineer` |
| `/practice` | practice | coverage, practice sessions, learning signal, topics, history, resources, goal health | `/practice @Concurrency` |
| `/goals` | goals | goal details, progress, health, next action, complete, milestone, task, update task, goal, hierarchy, manageGoal | `/goals` |
| `/subjects` | subjects | topics, coverage, resources, organize resource, learning signal, manageSubjects, manageTopics, manageLibrary | `/subjects @Advanced Java` |
| `/progress` | progress | weekly analytics, history, goal progress, goal health, Study Circles, coverage | `/progress` |
| `/friends` | friends | getStudyCircles | `/friends @Java Study Squad` |
| `/help` | help | answered in the interface (no request, no credits) | `/help` |

\*Core reads on every routed turn: getUserProfile, getSubjects, getUserGoals and
getCalendar. Each mentioned record type adds its reader (for example, a subject adds
getTopics and auditTopicCoverage).

**Rules:**

- A command is recognized only at the start of the message (`/schedule …`), in any letter
  case. `please /schedule` and `/scheduled` aren't commands.
- Commands combine with mentions and free text. The rest of the message is still
  classified, so `/friends delete my SQL topic` also routes the deletion request, which is
  still only an approval card.
- Plain-language equivalents reach the same workflows:

  | Request | Workflow |
  |---|---|
  | "I'm bad at Advanced Java. I need more sessions." | practice + schedule |
  | "I'm busy this week. Schedule Java and SQL next week after 7 PM." | schedule |
  | "I want to become a backend engineer." | plan |
  | "I missed three sessions. Help me catch up." | catchup |
  | "I haven't finished my SQL milestone." | catchup |
  | "How am I doing compared to my friends?" | progress + friends |

- Requests the router doesn't recognize keep every tool, so nothing depends on using a
  shortcut.

## @ mentions

| Type | Suggests | Ownership or visibility rule |
|---|---|---|
| subject | your subjects (active and archived) | `subjects.user_id` |
| topic | non-archived topics | owned subject |
| goal | your goals | `goals.user_id` |
| milestone, task | items of your goals | owned goal |
| session | calendar blocks (one-off or series) | `schedule_blocks.user_id` |
| resource | library items | `resources.user_id` |
| friend | accepted friends, active, no block either way | `friendships` + `user_blocks` |
| circle | study groups you belong to | `study_group_members` |

- **Composer:** `@` after a space opens the menu. Names may contain spaces (up to 4 words
  and 40 characters).
- **Keyboard:** ↑/↓ wrap, Enter or Tab inserts, Escape dismisses until the trigger changes.
- **Pointer:** click or tap inserts without moving focus out of the textarea.
- **Tokens:** highlighted inline by a backdrop layer; native editing, IME and mobile
  keyboards keep working. Editing a token's text removes its reference.
- **Search:** debounced at 150 ms, stale requests aborted, cached in memory per component,
  with "Show more results" pagination. It never calls the model or uses credits.
- **What's sent:** `references: [{type, id}]`, up to 10. Labels are always re-read on the
  server.
- **Unavailable references:** deleted, forged and other people's IDs all resolve the same
  way, so their existence isn't revealed.
- **Duplicate names:** each result carries a disambiguating detail (status, parent, date)
  and a separate ID.
- **Persistence:**
  - references are saved with the user message, so retry and regenerate reuse them
  - picked mentions survive a refresh of the draft (sessionStorage) while their tokens are
    still in the text
