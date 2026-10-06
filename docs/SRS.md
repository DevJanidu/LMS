# Software Requirements Specification (SRS) — FINAL
## Universal Learning Management System (working name: StudyFlow)

**Version:** 1.0 MVP (final, merged)
**Date:** 6 October 2026
**Stack:** Next.js + TypeScript · Neon Postgres (database) · Neon Object Storage (files) · Vercel (hosting)

> **Product principle:** A first-time user should understand the app without any training.

---

## 0. How to read this document

This document is written so **anyone** can follow it: owner, designer, developer, teacher or student.
Each section starts with **In plain words** (the idea), then the exact rules.

Rule strength:
- **MUST** = required for Version 1
- **SHOULD** = include in Version 1 if time allows (otherwise 1.1)
- **COULD** = later

Technical words are explained in the Glossary (Section 28).

---

## 1. Purpose and vision

**In plain words:** A very simple personal study workspace for *any* learner. Add what you study, break it into topics, keep your materials, press a timer when you study, and see your progress, streaks and plan.

### 1.1 Who it is for
School students · University students · Exam and certification candidates · Online-course learners · Self-taught learners · Professionals learning new skills · Anyone organising their own studies.

### 1.2 What it helps a learner do
1. Organise what they need to study
2. Split subjects into topics
3. Keep PDFs, links, videos and notes in one place
4. Plan when to study (timetable + calendar)
5. Track real study time with a timer
6. See completion % for each subject
7. Build study streaks
8. See weekly and monthly study analytics

### 1.3 Universal by design
The app must **not** depend on a school, university, teacher, classroom, semester or formal course. We use neutral words: **Subject, Topic, Study session**. One data model serves everybody:

```
School student      Mathematics → Algebra, Geometry, Statistics
University student  CS302 Algorithms → Sorting, Trees, Graphs, Dynamic Programming
Self-learner        AWS Solutions Architect → IAM, EC2, S3, VPC, Lambda
```

No separate "school mode" or "university mode" exists.

### 1.4 The four questions Version 1 must answer
1. **What am I learning?** → Subjects + Topics
2. **What should I study next?** → Dashboard + Timetable + Calendar + Deadlines
3. **How much have I completed?** → Topic completion + Subject progress %
4. **How much have I actually studied?** → Timer + Sessions + Analytics + Streaks

Every Version 1 feature must support one of these questions, or the safe running of the platform.

---

## 2. MVP goals and non-goals

### 2.1 Goals
- Extremely simple for first-time users (add a subject and start the timer in **under 2 minutes** after signing up)
- Subjects → topics → progress %
- Timer-based study tracking with daily, weekly, monthly analytics and streaks
- Store PDFs, files, links, video URLs and text notes
- Customisable weekly timetable and calendar
- Light goals and deadlines
- Super Admin dashboard to monitor platform usage
- Works on desktop, tablet and mobile browsers
- Each learner's data stays private

### 2.2 Non-goals (NOT in Version 1)
Teacher or instructor accounts · School/university administration · Classrooms and enrolment · Assignment submission · Grading, attendance, report cards · Live classes and video calls · AI tutor, AI notes, AI quizzes · Social feeds, public profiles, messaging, study groups, leaderboards · Complex gamification · Paid subscriptions · Native mobile apps

---

## 3. Users and roles

| Role | Who | Can do |
|---|---|---|
| **Learner** | Anyone who signs up | Manage own account, subjects, topics, resources, timer, sessions, analytics, goals, timetable, calendar. Cannot see anyone else's data. |
| **Super Admin** | Product owner / team | See platform statistics, search users, view each user's **study statistics** (time, streak, subject progress), deactivate/reactivate accounts, monitor storage and usage. |

**Admin privacy rule:** The Super Admin monitors **numbers and activity**, not private content. By default the admin does **not** see learners' notes, uploaded files, or the text they write about sessions. Content may be opened only for a documented abuse or legal investigation, and that access is recorded in the audit log.

---

## 4. Product structure

```
User
 └── Subject
      ├── Topics / Subtopics
      ├── Resources (files, links, videos, notes)
      ├── Study sessions
      ├── Progress (calculated)
      └── Target date (optional)
```

---

## 5. Accounts and login

**In plain words:** People create an account, log in, and recover a forgotten password.

| ID | Requirement | Level |
|---|---|---|
| AUTH-01 | Register with name, email, password (minimum 8 characters) | MUST |
| AUTH-02 | Log in securely | MUST |
| AUTH-03 | Log out | MUST |
| AUTH-04 | Password reset through an emailed, expiring link | MUST |
| AUTH-05 | Learner and admin pages require login (protected routes) | MUST |
| AUTH-06 | Roles (Learner / Super Admin) checked **on the server** for every request | MUST |
| AUTH-07 | Profile: name, time zone, basic preferences (theme, week start day) | MUST |
| AUTH-08 | Delete my account and all my data | MUST |
| AUTH-09 | Accept Terms and Privacy Policy at sign-up, with a clear line that the platform admin can see study statistics | MUST |
| AUTH-10 | Email verification | SHOULD |
| AUTH-11 | Sign in with Google | SHOULD |
| AUTH-12 | Export my data | SHOULD |

The Super Admin account is created manually by the owner (not through public sign-up).

---

## 6. First-time onboarding (1–3 minutes)

**In plain words:** A new user is guided to the first study session quickly. Every step can be skipped.

1. **Welcome** — one sentence: *"Organise what you're learning, track your study time, and see your progress."*
2. **Learning context (optional)** — School / University / Exam or Certification / Self-study / Other. Used only for friendly suggestions; it never changes the data model.
3. **First subject** — create it (or pick an example such as Maths, Science, English, Programming).
4. **Topics** — add some, paste a list (one per line), or skip.
5. **Weekly goal (optional)** — "How many hours would you like to study each week?"
6. **Dashboard** — go straight in.

Empty screens must always show friendly help and one big button (e.g. "No subjects yet — add your first one").

---

## 7. Learner dashboard

**In plain words:** The home screen. It answers: *What should I study today? How much have I studied? How much have I completed? What next?*

| Component | Description |
|---|---|
| **Start Studying** | Big, always-visible button |
| Today's schedule | Study blocks planned for today |
| Weekly study time | Progress toward weekly goal, e.g. `8h 30m / 12h — 71%` |
| Study streak | e.g. `🔥 6-day streak` |
| Subject progress | e.g. `Mathematics 7/10 topics — 70%` with a bar |
| Recent sessions | Subject, topic, duration, date |
| Upcoming deadlines | Subject and topic target dates |
| Quick actions | Add subject · Add topic · Add resource · Schedule study · Start studying |
| Continue where you left off | Last studied subject/topic (SHOULD) |

The first screen must not overwhelm the learner with charts. Detailed charts live on the Analytics page.

---

## 8. Subjects

**In plain words:** A subject is a "box" for anything you study.

| ID | Requirement | Level |
|---|---|---|
| SUB-01 | Create, edit, archive, delete subjects | MUST |
| SUB-02 | Only **title** is required; description, colour, target date are optional | MUST |
| SUB-03 | Search and filter subjects | MUST |
| SUB-04 | Subject list shows each subject's progress bar and % | MUST |
| SUB-05 | Delete asks for confirmation and warns that topics, resources and session history go with it. **Archive** is suggested instead, so history is kept. | MUST |

**Subject page shows:** title, description, completion %, completed/total topics, total study time, topics, resources, recent sessions, target date.

**Limits (anti-abuse):** up to 50 active subjects per user, 200 topics per subject.

---

## 9. Topics (subtopics)

**In plain words:** The small parts of a subject. Tick them off as you finish.

| ID | Requirement | Level |
|---|---|---|
| TOP-01 | Create, edit, delete topics inside a subject | MUST |
| TOP-02 | Status: **Not started / In progress / Completed** (a simple checkbox for Completed) | MUST |
| TOP-03 | Mark completed topics as not completed again | MUST |
| TOP-04 | Reorder topics (drag and drop) | MUST |
| TOP-05 | Optional target date | MUST |
| TOP-06 | Add many topics at once (one per line) | SHOULD |

When a topic is completed, `completed_at` is saved and subject progress updates immediately.

---

## 10. Subject progress

**Formula:**
```
Progress % = Completed active topics ÷ Total active topics × 100
```
Example: 10 topics, 7 completed → **70% Complete**.

Rules:
- No topics → show "No topics yet" (0%, Not started).
- Progress is **calculated**; it cannot be edited by hand.
- Study time does **not** decide completion (5 hours on a topic does not complete it).
- Archived/deleted topics do not distort progress.

---

## 11. Resources and notes library

**In plain words:** Keep your study material inside the subject it belongs to.

| ID | Requirement | Level |
|---|---|---|
| RES-01 | Resource types: **File upload** (PDF, documents, images), **Link**, **Video URL**, **Text note** | MUST |
| RES-02 | Every resource has a title and belongs to a subject; it may optionally belong to one topic | MUST |
| RES-03 | Open links/videos in a new tab; open or download files securely | MUST |
| RES-04 | Edit and delete resources. Deleting also removes the stored file (or schedules its removal). | MUST |
| RES-05 | Validate uploads: allowed types only, size limits, friendly error messages | MUST |
| RES-06 | Validate external URLs | MUST |
| RES-07 | A **Resources** page to browse all resources, filtered by subject, topic and type | MUST |
| RES-08 | YouTube links show a thumbnail preview | SHOULD |
| RES-09 | Text notes with basic formatting (bold, lists, headings) | SHOULD |

**Default limits (adjustable):** 10 MB per file · 100 MB per user. Allowed: PDF, common documents, PNG/JPG.

**Storage design:**
- Files are stored in **Neon Object Storage** (S3-compatible, private bucket).
- Postgres stores only the **details** (title, storage key, type, size, owner), never the file itself.
- Files are opened through short-lived, signed, private links.
- Because Neon Object Storage speaks the standard S3 protocol, the code stays portable if you ever move to another S3-compatible service.

---

## 12. Study timer

**In plain words:** Press Start before studying and Finish when done. The app remembers what you studied and for how long.

| ID | Requirement | Level |
|---|---|---|
| TMR-01 | **Start Studying** asks for a **Subject** (required) and a **Topic** (optional) | MUST |
| TMR-02 | Timer shows elapsed time with **Pause, Resume, Finish**, and **Discard** (for accidental starts) | MUST |
| TMR-03 | Only **one** active timer per learner | MUST |
| TMR-04 | The timer survives page navigation, refresh, and closing/reopening the browser. The server stores the **start timestamp**; the screen calculates elapsed time from timestamps (not just a JavaScript counter). | MUST |
| TMR-05 | A small "● Studying Mathematics 00:42:18" indicator stays visible on every page while a timer runs | MUST |
| TMR-06 | On Finish, the learner may add a note: *"What did you study?"* | MUST |
| TMR-07 | Sessions shorter than **1 minute** are not saved (with a message) | MUST |
| TMR-08 | If a timer runs more than **6 hours**, ask "Are you still studying?" and cap the session if there is no answer | MUST |
| TMR-09 | Pomodoro mode (25/5) | COULD |

---

## 13. Study sessions and history

Finishing a timer creates a **study session**: subject, optional topic, start, end, duration, status, note, source (timer or manual).

| ID | Requirement | Level |
|---|---|---|
| SES-01 | Finishing the timer saves a session | MUST |
| SES-02 | **Manual sessions**: add, edit or delete a session (for when the learner forgot to start or stop the timer) | MUST |
| SES-03 | **Session history** table (date, subject, topic, duration) filterable by date, subject and topic | MUST |
| SES-04 | Selected topic must belong to the selected subject | MUST |

---

## 14. Analytics, streaks and goals

### 14.1 Analytics page (kept simple)
- **Numbers:** Today · This week · This month · Current streak · Longest streak · Topics completed this month
- **Charts:** Daily study time (last 7 days) · Study time by subject (week / month / all time) · Monthly calendar heat-map of studied days
- Avoid filling the page with unnecessary charts.

### 14.2 Streak rules (so everyone calculates the same way)
- A **study day** is a local calendar day with **at least 10 minutes** of valid study in total (the 10 is an admin setting).
- Days are based on the **learner's own time zone**.
- **Current streak** = consecutive study days up to today. If today has no study yet, the streak is not broken until the day ends.
- Missing a full day resets the current streak to 0.
- **Longest streak** = best run ever, kept forever.

### 14.3 Weekly goal
- Optional weekly target (hours/minutes), shown on the dashboard.
- Formula: `weekly study minutes ÷ weekly target minutes × 100`. The bar stops at 100% but the real hours keep showing.

### 14.4 Deadlines
- Optional target date on a **subject** or a **topic**.
- Shown on the dashboard and calendar, e.g. *"AWS Certification — Dec 15 — 64% — 9 topics remaining."*
- Deliberately lightweight: no complex goal system in Version 1.

### 14.5 Definitions
| Measure | Definition |
|---|---|
| Study time | Sum of valid session durations |
| Daily / Weekly / Monthly | Within the learner's local day / week / month |
| Subject study time | Sum of valid sessions for that subject |

---

## 15. Timetable and calendar

**In plain words:** Plan your week and change it any time.

| ID | Requirement | Level |
|---|---|---|
| TT-01 | Create a study block: title or subject, optional topic, date/day, start time, end time, optional note, optional colour | MUST |
| TT-02 | Repeat: **one-time** or **weekly** (e.g. every Monday and Wednesday) | MUST |
| TT-03 | Edit, move, delete blocks. For repeating blocks choose "this one only" or "all future". | MUST |
| TT-04 | **Week view** and **Month view** | MUST |
| TT-05 | Calendar also shows subject and topic target dates | MUST |
| TT-06 | Dashboard shows today's blocks and the next upcoming block | MUST |
| TT-07 | Allow custom, non-study blocks (e.g. Class, Exam, Break) | MUST |
| TT-08 | Warn (do not block) when two blocks overlap | SHOULD |
| TT-09 | Drag a block to change its time | SHOULD |
| TT-10 | "Start timer" button on a block, opening the timer with its subject selected | SHOULD |

---

## 16. Search and reminders

- **Search (MUST):** subjects, topics and resources; resource filters by subject, topic and type.
- **Reminders (MUST, in-app only):** upcoming study block, subject deadline, topic deadline. Email and push notifications come later.

---

## 17. Super Admin dashboard

**In plain words:** The owner can see how the platform and its learners are doing.

| ID | Requirement | Level |
|---|---|---|
| ADM-01 | Only Super Admins can open admin pages (checked on the server) | MUST |
| ADM-02 | KPI cards: Total users · Active users · New users this week · Study sessions today · Total study hours · Active subjects | MUST |
| ADM-03 | Users list with search and sort (name, email, joined, last active, total study time) | MUST |
| ADM-04 | **User detail:** account status, study time per day/week, streaks, subjects with progress %, session counts — **no notes, files or note text** | MUST |
| ADM-05 | Deactivate and reactivate users | MUST |
| ADM-06 | Platform analytics: daily/weekly/monthly active learners, sessions per day, average session length, aggregate study hours, subjects created, topics completed | MUST |
| ADM-07 | Storage monitoring: total storage and biggest users | MUST |
| ADM-08 | **Audit log** of important admin actions (deactivate, reactivate, any content access, settings changes) | MUST |
| ADM-09 | Admin settings (e.g. streak minutes, upload limits) | SHOULD |
| ADM-10 | CSV export of the users list | SHOULD |

---

## 18. Screens and navigation

**Learner sidebar** (bottom bar or menu on phones):
`Dashboard · Subjects · Study · Calendar · Analytics · Resources · Settings`

Super Admin navigation is separate.

```
Auth        /login  /register  /forgot-password  /reset-password
Onboarding  /onboarding  /onboarding/context  /onboarding/subject  /onboarding/goal
Learner     /dashboard  /subjects  /subjects/[id]  /study  /study/history
            /calendar  /analytics  /resources  /settings
Admin       /admin  /admin/users  /admin/users/[id]  /admin/analytics
            /admin/storage  /admin/settings
```

---

## 19. Data model

| Table | Key fields |
|---|---|
| **users** | id, name, email, password hash (or provider id), role, timezone, learning_context, status, created_at, updated_at, last_active_at |
| **user_preferences** | user_id, weekly_target_minutes, theme, week_start_day |
| **subjects** | id, user_id, title, description, display_color, target_date, status (active/archived), created_at, updated_at |
| **topics** | id, subject_id, title, description, status, target_date, sort_order, completed_at, created_at, updated_at |
| **resources** | id, user_id, subject_id, topic_id (optional), type (file/link/video/note), title, url, storage_key, text_content, mime_type, size_bytes, created_at |
| **active_timers** | user_id (only one), subject_id, topic_id, started_at, paused_at, paused_total_seconds |
| **study_sessions** | id, user_id, subject_id, topic_id (optional), started_at, ended_at, duration_seconds, status, note, source (timer/manual), created_at |
| **schedule_blocks** | id, user_id, subject_id, topic_id, title, starts_at, ends_at, recurrence_rule, note, created_at, updated_at |
| **schedule_exceptions** | id, block_id, date, is_cancelled, new_starts_at, new_ends_at |
| **notifications** | id, user_id, type, title, body, scheduled_for, read_at, created_at |
| **password_resets** | id, user_id, token_hash, expires_at |
| **audit_logs** | id, actor_user_id, action, target_type, target_id, metadata, created_at |
| **app_settings** | key, value |

Progress, streaks and totals are **calculated** from these tables (cached later only if needed).
Recommended indexes: `user_id`, `subject_id`, `topic_id`, `started_at`, `created_at`.

---

## 20. Business rules

1. Every learner-owned record belongs to the logged-in learner.
2. A subject belongs to exactly one learner; a topic to exactly one subject.
3. A study session belongs to one subject and optionally one topic of that subject.
4. Only one active timer per learner.
5. Subject progress is derived from topic completion and cannot be edited by hand.
6. Archived or deleted topics must not distort progress.
7. Deleting a subject leaves no orphaned topics, resources or sessions.
8. Deleting a resource also removes (or schedules removal of) its stored file.
9. All times are stored in **UTC** and shown in the learner's time zone.
10. Admin permission is checked on the server for every admin action.
11. Deactivated users cannot log in; their data is kept until deletion is requested.

---

## 21. Technology stack

| Part | Choice |
|---|---|
| App | **Next.js** (App Router) + **TypeScript** |
| UI | Tailwind CSS + accessible components (shadcn/ui style) |
| Database | **Neon Postgres** |
| ORM | **Drizzle** (Prisma is also fine) |
| Auth | A proven library/service (Auth.js, Better Auth, or similar) — do not write password/session crypto by hand |
| File storage | **Neon Object Storage** (private, S3-compatible) |
| Validation | Zod |
| Charts | Recharts (or similar light library) |
| Email | Resend (or similar) for password reset |
| Hosting | Vercel (app) + Neon (database and storage) |

**Architecture hints**
- Server Components for data-heavy read pages.
- Client Components only where needed: timer, charts, calendar interactions, dialogs, drag-and-drop.
- All changes go through secure server actions or route handlers with **validation and ownership checks**.
- Suggested folders: `app/(auth)`, `app/(learner)`, `app/admin`, `components/`, `lib/{db,auth,storage,analytics,validation,utils}`.

---

## 22. Non-functional requirements

**Speed:** Pages load in under 2 seconds on a normal 4G connection. Timer start/finish responds in under 1 second. Avoid N+1 queries; index and aggregate efficiently.

**Ease of use:** Short, simple words; clear buttons; one main action per screen; no deep navigation. Light and dark themes (SHOULD). English first, built so other languages (e.g. Sinhala, Tamil) can be added later.

**Responsive:** Desktop, tablet and phones (down to 360 px wide). Latest two versions of Chrome, Edge, Safari, Firefox.

**Accessibility (aim: WCAG 2.1 AA):** keyboard navigation, visible focus, semantic headings, labelled form fields, accessible dialogs, good contrast.

**Reliability:** The timer must recover after refresh, navigation and reopening. Friendly error messages (never raw technical errors). Automatic database backups. Target uptime 99%+ for MVP.

**Scalability:** Comfortable for about 1,000 users at launch and up to 10,000 without redesign. No school-specific assumptions in the core schema.

---

## 23. Security and privacy

**Security**
- HTTPS everywhere; secure cookies/sessions
- Passwords hashed (argon2 or bcrypt); never stored or logged in plain text
- Ownership verified on **every** learner query and change (a learner cannot open another's data by changing an ID in the URL)
- Admin role verified on every admin operation
- Protection against injection, cross-site scripting and request forgery
- Rate limiting on login, sign-up and password reset
- Private file storage with signed, short-lived access; restricted file types and sizes
- Never log passwords, tokens or private document contents
- Secrets stored in environment variables, never in code
- Record important admin actions

**Privacy**
- Learner data is private by default; collect only what is needed (name, email, study data)
- No ads and no selling of data
- Delete-account removes the user's data and stored files
- Terms and Privacy Policy pages must exist before launch
- **Young users:** school students may be minors. Before launch, the owner must check the privacy and child-data laws of the countries served (for example Sri Lanka's Personal Data Protection Act, and GDPR / COPPA where relevant), set a minimum age, and decide whether parental consent is needed. A date-of-birth or age checkbox SHOULD be added at sign-up.

---

## 24. Key user flows

**Flow 1 — First study session**
Register → Onboarding → Create subject → Add topics → Dashboard → Start Studying → Select subject (and topic) → Timer runs → Finish → Session saved → Dashboard and analytics update

**Flow 2 — Complete a topic**
Subject → Topic list → Mark completed → `completed_at` saved → Progress recalculated → Dashboard updates

**Flow 3 — Add study material**
Subject → Add resource → Choose type (File / Link / Video / Note) → Optional topic → Save → appears in the subject and the Resources page

**Flow 4 — Plan the week**
Calendar → New study block → Choose subject, day, time, repeat weekly → Save → appears on week view and dashboard

---

## 25. Acceptance criteria (the MVP is done when all are true)

**Accounts:** a user can register, log in, log out, reset a forgotten password, and delete their account.

**Subjects and topics:** a learner can create, edit, archive and delete subjects, and create, edit, reorder and complete topics.

**Progress:** 10 topics with 7 completed shows **70%**; 1 of 3 shows **33%**; no topics shows "No topics yet".

**Timer:** start → pause → resume → move to another page → refresh → return: the elapsed time is still correct. Finishing saves the session. Discard saves nothing. A second timer cannot be started.

**Analytics:** finishing a session updates today, week, month, subject time, history and streak.

**Streaks:** 10+ minutes of study on 3 days in a row shows a streak of 3; skipping a day resets the current streak to 0 while the longest streak stays.

**Resources:** upload an allowed PDF, open it securely, delete it (the stored file is removed too); a file over the limit is rejected with a clear message; add a link, a video URL and a text note.

**Calendar:** create, edit, delete a study block; create a weekly repeating block; editing "this one only" does not change other weeks; blocks show in week and month views.

**Privacy:** Learner A cannot access Learner B's subjects, topics, sessions, timetable or resources, even by editing IDs in the URL or request.

**Admin:** a normal learner cannot open admin pages. The admin can view KPIs, search users, view a user's study statistics, deactivate/reactivate users, and view aggregate activity — but cannot see notes or file contents. Admin actions appear in the audit log.

**Quality:** usable on a 360 px phone screen; empty and loading states exist on every screen; keyboard-only use works for core actions.

---

## 26. Version scope and build phases

### Version 1 (MVP)
Everything marked MUST in this document.

### Version 1.1 (quick wins)
Google login · email verification · data export · Continue-where-you-left-off · topic bulk-add · drag-and-drop in timetable · overlap warning · admin CSV export and admin settings · dark mode · YouTube thumbnails · text-note formatting

### Build phases
| Phase | Build | Result |
|---|---|---|
| 1 Foundation | Next.js, TypeScript, database, schema, migrations, auth, roles, protected layouts | Users can sign in to an empty app |
| 2 Subjects and topics | CRUD, ordering, completion, progress | Users organise their studies |
| 3 Timer | Start, pause, resume, finish, persistence, sessions, history, manual sessions | Users track real time |
| 4 Dashboard and analytics | Today/week/month, subject analytics, charts | Users see their effort |
| 5 Resources | Upload to Neon Object Storage, links, videos, notes, Resources page | Users keep their material |
| 6 Timetable and calendar | Weekly timetable, recurring blocks, calendar, deadlines, weekly goal | Users plan their week |
| 7 Study intelligence | Streaks, search, filters, in-app reminders | Users stay motivated |
| 8 Super Admin | KPIs, user list and detail, deactivate, platform analytics, storage, audit log | Owner can monitor |
| 9 Launch polish | Authorisation tests, responsive and accessibility checks, performance, errors, empty/loading states, security review, legal pages | Ready for real users |

---

## 27. What's missing? Ideas for after launch

**Study features:** Pomodoro mode · exam countdowns · flashcards and spaced repetition · quizzes · study templates (e.g. "Intro to Python") · habit tracking · to-do/homework list · weekly summary email · multi-language · installable web app (PWA)

**AI:** study assistant · study plans · PDF summaries · AI quizzes and flashcards · topic explanations

**Collaboration:** study groups · shared subjects and resources · friends and accountability partners

**Institutional LMS (only if the product later targets organisations):** teachers, classes, assignments, grading, attendance, course management. These must not complicate the personal-learning MVP.

---

## 28. Glossary

- **SRS** — Software Requirements Specification: this document, a written plan of what the software must do.
- **MVP** — Minimum Viable Product: the smallest useful first version.
- **Subject** — an area of study (e.g. Maths).
- **Topic / subtopic** — a smaller part of a subject (e.g. Algebra).
- **Study session** — one period of studying recorded by the timer or entered manually.
- **Streak** — number of days in a row with enough study.
- **Dashboard** — a page of summaries.
- **Super Admin** — the owner-level user who sees platform-wide information.
- **Database (Neon Postgres)** — where text and numbers are saved.
- **Object storage** — where files such as PDFs are saved, separate from the database.
- **Signed link** — a private file link that stops working after a short time.
- **Server-side check** — a permission check done on the server, which users cannot bypass.
- **UTC / time zone** — UTC is a standard world time; a time zone converts it to local time.
- **Hashing** — scrambling a password one-way so the original cannot be read.
- **Audit log** — a record of who did what.
- **Rate limiting** — limiting repeated attempts (like logins) to stop abuse.
- **Responsive** — looks good on any screen size.
- **WCAG** — international guidelines for accessible websites.

---

## 29. Decisions the owner still needs to make

1. Final product name and logo
2. Minimum age and parental-consent rules
3. Free forever, or paid plans later (affects storage limits)
4. Launch countries (affects privacy law)
5. Is Google login needed on day one?
6. Confirm default limits: 10 MB per file, 100 MB per user, streak day = 10 minutes

---

*End of Final SRS — Universal LMS MVP v1.0*