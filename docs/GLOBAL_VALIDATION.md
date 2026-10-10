# Application-wide performance validation

Validated on 2026-10-09 against local production builds, Chrome, and the configured remote Neon, Redis, and object-storage services. This is an application-wide upgrade with explicit validation limits; it is not a production latency or capacity certification.

## Discovery and architecture

The automatic inventory scans 210 TypeScript/JavaScript source files, 40 page/API route entries, and 81 components in 14 component folders. It includes event handlers, forms, dialogs, reads, mutations, and loader calls. API routes also expose the maintenance jobs that are not component folders. Discovery is reproducible with `node scripts/performance-inventory.mjs`; absence of a syntactic warning does not prove runtime correctness.

Shared ordinary mutations use immediate journal projections, stable UUID identities, duplicate-request sharing, dependency queues, selective rollback, small authenticated HTTP confirmations, and targeted background reads. Reads have independent request lifecycles. Parent/child deletion, reassignment, and timer operations now share dependency keys. Account revisions remain server-issued. The calendar additionally retains durable receipts and record-version conflict checks for recurrence operations.

Ordinary CRUD does not refresh the root layout or disable the workspace. Background completions cannot close a newer subject, resource, session, or confirmation dialog. Note-detail reads use row pending states and ignore superseded selections. Topic creation/reordering remains available while earlier changes are queued. Failed theme persistence restores the current journal projection, including newer edits.

## Module checklist

| Discovered area | Review and implementation | Runtime evidence and limits |
| --- | --- | --- |
| Dashboard | Focused streamed loaders, scoped aggregates, minute updates | Three-persona desktop/mobile routes; final production route metrics |
| Subjects | Shared optimistic create/edit/archive/delete and confirmed new-record navigation | Three-persona persistence/ownership; slow-save navigation/rollback; final dialog ordering |
| Topics | Completion, bulk creation, editing, deletion, queued reorder and immediate progress | Three-persona CRUD; live 200-topic creation/reorder/limit checks; shared dependency tests |
| Study | Optimistic start/pause/resume/discard; server-confirmed elapsed duration | Three-persona API timer lifecycle; browser pause/reload/resume/finish/history |
| Sessions/history | Focused paginated reads and mutation overlays; derived optimistic duration/source | Three-persona CRUD; paused-time and DST database checks; final dialog ordering |
| Calendar/planner | Range cache/journal, recurrence scopes, version conflicts, receipts, reconnect sync | Three-persona create/move/replay/delete; gesture audit covers rapid moves, resize, month navigation, one/future/all recurrence, rollback/retry and mobile/dark UI |
| Resources/notes | Independent lists/details, optimistic metadata, targeted counts/storage updates | Three-persona note/link/video CRUD; note-dialog ordering; URL and ownership rejection |
| File resources | Signed upload/finalization remains form-local and server-confirmed | Real browser upload, exact download and foreign-account denial for new, active and stress accounts; one text MIME type exercised |
| Analytics/goals/progress | Focused SQL aggregates, memoized charts, local topic progress, cadence limits | Three-persona route checks and preference persistence; analytics/timezone/DST tests; final route measurements |
| Notifications | Immediate read state and bounded shell reconciliation | Three-account read persistence, foreign-owner rejection and CSRF checks; scheduled generation is not live-tested here |
| Settings/profile | Shared optimistic preferences; localized account confirmation; theme rollback | Three-account save/restore; failed-theme browser test; account-deletion exit in learner E2E |
| Authentication | Form-local pending; server-confirmed sessions; safe destinations; live role guards | Registration/login, public redirects, inactive-user and role boundaries; reset email delivery remains unverified |
| Onboarding | Local draft steps, atomic final save, localized errors including network failures | Fresh registration, five-step skip flow, filled subject/topic/goal flow, failed final save and duplicate-free retry |
| Admin | Dedicated overview/analytics/storage/settings/detail loaders; independent user pagination | Production desktop/mobile routes, settings save/restore, deactivation/reactivation and privacy/role checks |
| Studyflow/common/form/ui | Shared confirmation, shell search, timer controls, primitives and pending/error displays | Source inventory and indirect coverage through feature scenarios; every primitive/locale combination is not separately exercised |
| Maintenance API jobs | Timer/retention/storage jobs inspected; reminder grouping removes repeated per-user/per-block array scans and preference overfetching | Live cron invocation is blocked on a disposable full database/scheduler environment: current jobs affect accounts beyond the three test personas |

No independent tasks/to-do module exists in this source tree. Notes belong to Library; study goals belong to preferences and analytics. Public/legal/error routes and onboarding step routes are included in the route inventory, not silently excluded as hidden features.

## Executed checks

- Strict TypeScript, ESLint, and isolated production builds pass.
- Unit suite: 189 passing tests; 9 integration/performance tests intentionally skipped in the ordinary unit command. The separate analytics runner passes 13 checks, including translation parity across 499 message keys.
- Live UUID-scoped ownership suite: 7 passing tests, including foreign read/write/attachment denial, private-content exclusion, paused-session preservation, 200-topic batch/reorder quotas, concurrent timer exclusivity, cascades, deactivation, and SQL streak equivalence across DST/deletion.
- Broad three-account audit: 76 checks pass, with 70 measured write requests. A new registration/onboarding account and two independent large-data learners are used; the latter fixtures contain about 1,095 sessions each.
- Final three-account mutation audit: 48 checks pass for subject/topic operations, note/link/video create-edit-delete, session create/edit/delete, and UUID cleanup.
- Supplemental notification/export audit: 7 checks pass.
- Final dialog audit: subject/resource/session pending writes preserve a newer draft; failed theme writes restore the current preference.
- Real text-file upload/download/authorization checks pass for all three personas. Subject/resource fixtures are deleted; object removal follows the existing storage-deletion queue rather than invoking a global cleanup job.
- Browser E2E covers public route protection, filled onboarding with failed-save recovery, registration, topics, timer persistence/finish, history, role protection and account deletion. Final results are in `E2E_FINAL_RESULTS.json`.

The sandboxed build initially failed to download its font. Sandboxed authenticated tests also hit fail-closed throttling because service access was unavailable. Retrying with approved network access resolved those conditions; security throttling was not weakened. Calendar validation initially matched both its error alert and Next.js's route announcer; the selector was scoped to the application content and the rerun passed. The account-deletion test initially used the wrong button label; this was corrected before the final rerun.

## Measured responsiveness and backend latency

| Measurement | Observed result | Interpretation |
| --- | --- | --- |
| Optimistic subject visibility under a held write | 76 ms | Browser audit; the failed write rolls back while navigation remains usable |
| Calendar optimistic creation | 55–68 ms | Includes recurring creation |
| Calendar drop after pointer release | 75 ms | Visible optimistic change; persistence is separate |
| Cached calendar week navigation | 55 ms | No new range request in the tested cached navigation |
| Local route first contentful paint | 60–112 ms | Can be a streamed shell; not completion of all data loading |
| Local route navigation to network idle | 1.24–5.90 seconds | Final learner/admin measurements, unthrottled Chrome |
| Final mutation confirmation | 2.36–6.09 seconds | Remote Neon/Redis and transaction round trips still dominate |
| Text-file lifecycle including confirmation/download | Approximately 21–23 seconds | Server confirmation, storage copy/verification and download; form-local pending |

Streak preservation now computes and upserts only the required scalar in one database statement instead of fetching a profile, transferring full analytics, and then writing preferences. Platform settings are upserted as one batch. These reduce database round trips without removing ownership locks or correctness checks. No deployment-region change, production SLA claim, or controlled before/after speed ratio is inferred from these local measurements.

## Remaining blockers and explicit limits

1. **Production latency/capacity certification:** current writes still take seconds. Deployment/Neon/Redis region placement and a representative isolated load environment are needed to validate and improve the end-to-end service latency. The large fixture is not a 50,000-session or many-user saturation test.
2. **Password reset/email delivery:** no controlled real test inbox and verified sending-domain workflow was exercised. The disabled Google sign-in placeholder remains disabled; an unavailable feature is not counted as an optimized successful interaction.
3. **Global scheduled jobs:** invoking reminders, retention, or storage cleanup against the current shared database would affect unrelated accounts. A disposable whole database and scheduler environment is required for safe lifecycle validation. Reminder generation still loads its global candidate batch; bounded job pagination at large scale remains unverified.
4. **Coverage limits:** arbitrary malformed inputs, every upload MIME type, failed file replacement at each storage step, all onboarding variations, simultaneous multi-tab edits of every record type, every primitive, and every translated/RTL screen combination are not exhaustively browser-tested. Shared journals, validation, and ownership tests cover representative failure/concurrency paths; the inventory is not a substitute for those missing scenarios.
5. **Concurrency semantics:** ordinary CRUD is serialized per dependency in one client and atomically per account in the database; simultaneous tabs use last-writer-wins. Calendar has explicit version-conflict detection and durable operation receipts. Other mutations do not claim durable exactly-once execution after an uncertain retry. Background synchronization is eventual and may wait until local writes finish.

These limits prevent claiming that every interaction has been independently proven production-ready. All recorded passing results should be read with their stated scope.

## Evidence files

`PERFORMANCE_INVENTORY.json`, `PERFORMANCE_CHECKLIST.md`, `GLOBAL_PERFORMANCE_RESULTS.json`, `FINAL_MUTATION_METRICS.json`, `GLOBAL-FINAL_METRICS.json`, `CALENDAR_FINAL_RESULTS.json`, `DIALOG_PERFORMANCE_RESULTS.json`, `SUPPLEMENTAL_PERFORMANCE_RESULTS.json`, `E2E_FINAL_RESULTS.json`, `VALIDATION_SUMMARY.json`, and `UPLOAD_*_PERFORMANCE_RESULTS.json` contain the inventory and measured outcomes. Local videos/traces/screenshots and fixture credentials stay under ignored audit/test directories.
