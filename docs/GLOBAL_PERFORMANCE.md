# Application-wide performance architecture

This pass discovers the application from TypeScript source and the App Router tree. `PERFORMANCE_INVENTORY.json` contains all 40 route entries and 81 components across 14 component folders. `PERFORMANCE_CHECKLIST.md` is regenerated from actual calls, forms and dialogs; it is an inventory, not a claim that every interaction has passed E2E.

## Shared architecture

Ordinary CRUD now uses `MutationJournal` and authenticated `/api/workspace` requests. Every operation has stable record/dependency keys. Its optimistic reducer runs immediately; shared keys queue in order, while independent requests can run concurrently. Failed layers are removed without restoring an obsolete whole-workspace snapshot. Concurrent duplicate requests share one promise. Creation UUIDs survive explicit retries. Writes are not automatically retried after uncertain network failures; bounded authoritative reads reconcile the result instead.

Confirmation responses contain a timer result and the committed account revision, rather than a full workspace. Targeted background reads reconcile shell, subject/progress, resource/storage, session or analytics fields. The client fences stale responses and cached route payloads with revisions and timestamps. Filtered/paginated collections retain mutation overlays until their own read has acknowledged the writes; layers are released when readers advance or unmount. Account/scope changes reset the journal.

Read requests use a separate transport with in-flight deduplication, validation, deadlines and private/no-store responses. They no longer enter Next.js's sequential Server Action dispatcher. Visible lists synchronize on focus, reconnect and a 30-second cadence. The shell polls only while visible and refreshes loaded dependent fields when another client changes the account revision.

Calendar retains its specialized range/recurrence journal because it additionally tracks occurrence identity, split series, exceptions, request receipts and expected record versions. It follows the same optimistic/keyed/rollback pattern. Range synchronization runs on focus and every 30 seconds; stores are keyed by account and timezone. FullCalendar's DOM rollback restores the current journal occurrence, rather than an obsolete drag snapshot.

## Module review

| Discovered module | Architecture and optimization | Validation scope |
|---|---|---|
| dashboard | Focused aggregate and schedule loaders; minute cadence for day/stat widgets; shared shell mutations | Three learner personas, desktop/mobile route checks |
| subjects | Immediate create/edit/archive/delete; per-record/dependency keys; new record links wait only for identity persistence | Subject/topic CRUD, concurrent writes, failed-save rollback and background navigation |
| topics | Completion, bulk create, edit, reorder and delete use the same journal; progress recalculates locally | API create/edit/delete, journal ordering and rollback tests; bulk/reorder reviewed in source |
| study | Timer-only pending controls; start/pause/resume/discard are optimistic; server verifies finish duration | API timer lifecycle and browser learner E2E |
| sessions/history | Optimistic manual edits/deletes over paginated rows; independent filtered reads; focused initial loader | Three-persona CRUD/persistence; source and unit interval validation |
| calendar/planner | Range journal, receipts, version conflict checks, scoped recurrence operations, focus sync and current-state rollback | API create/move/replay/delete plus gesture audit artifact |
| resources/notes | Optimistic note/link CRUD, collection overlays, row-only note loading; targeted storage/count synchronization | Three-persona note CRUD, ownership and URL validation; storage integration |
| analytics/goals/progress | Aggregate SQL, local topic progress, minute cadence, memoized charts and responsive canvas containment | Route checks, analytics/schedule tests, profile preference persistence |
| notifications | Immediate read-state update, keyed mutation and bounded shell synchronization | Source/unit review; live scheduled notification delivery requires a controlled cron/email environment |
| settings/profile | Optimistic profile/preferences; shell-only initial read; timezone-sensitive invalidation | Three-persona save/restore and route tests |
| authentication | Form-local pending and duplicate guards; session must be confirmed before protected navigation | Public E2E, registration/login, route protection and account guards |
| onboarding | Profile-only initial data; atomic, account-locked/idempotent completion | Fresh account's full first-run flow |
| admin | Dedicated overview/analytics/storage/settings loaders; privacy-preserving learner aggregates; paginated independent user reads | Admin route audit, settings save/restore and role boundaries |
| studyflow/common/form/ui | Shared localized confirmation behavior, timers, search debounce, skeletons, inherited primitives and error/retry banner | Source inventory, journal/API security tests and responsive route checks |

There are no standalone task/to-do modules in the discovered codebase. Notes belong to Library; goals belong to study preferences and progress/analytics. No applicable feature was inferred from a hardcoded module list.

## Backend changes

- Ordinary CRUD no longer invalidates the root layout or invokes `loadWorkspace`.
- All user-facing routes now use focused loaders, including learner subject detail and the admin learner statistics page. Admin detail fetches identifiers and aggregates without transferring private notes, resource contents or topic titles.
- Upload confirmation no longer revalidates the root layout; only Library/storage data is synchronized.
- Cache invalidation follows the changed entity family. Timer pause/resume and profile theme changes do not invalidate subject/calendar/history families.
- Streak preservation computes and upserts the required scalar in one SQL statement without transferring the full analytics payload. New sessions need only post-write preservation; deletion needs only pre-write preservation; destructive edits retain both. The live regression compares DST/paused-time/deletion results with analytics.
- Platform settings use one batch upsert. Reminder generation groups candidate rows by account and block once instead of repeatedly scanning whole arrays, and reads only reminder preferences.
- Existing account locks, ownership checks, topic batching, quotas and atomic timer writes remain. Database connections are bounded to ten per process with connection and idle deadlines.
- Dynamic route stale time is zero; static public pages retain their configured cache time. Ordinary mutations still avoid refreshing the page tree.

## Required server confirmation

Authentication, atomic onboarding completion, signed upload issuance/finalization, timer finish/elapsed-time verification, account deletion and administrative security changes retain local server confirmation. They do not show successful persistence before authorization/integrity checks complete. Only navigation to a newly created record is gated until its creation is confirmed; unrelated navigation and existing records remain usable.

## Evidence and limits

Results and remaining blockers are recorded in `GLOBAL_VALIDATION.md` and its linked evidence files. The final pass includes seven live ownership tests and real text-file browser lifecycles for all three personas. These are local production-build measurements against acknowledged audit fixtures, not a production SLA or load-test certification. Password-reset email delivery, globally scheduled jobs and exhaustive upload/interaction variants remain explicitly limited.

Workspace writes are serialized in the database per account to preserve quota/timer invariants. Calendar has durable operation receipts and explicit cross-tab record-version conflicts. Other UUID-backed CRUD writes avoid duplicate creations and reconcile authoritative state, but do not claim durable exactly-once execution for arbitrary network retries.
