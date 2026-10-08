# Complete QA test cases

This matrix is the executable scope for the StudyFlow QA pass. It covers the public routes, learner workspace, admin workspace, API boundaries, persistence, storage, responsive UI, and the calendar regression. Results are recorded in `TEST_EXECUTION_RESULTS.md`.

## Test personas and data

| Persona | Data | Use |
|---|---|---|
| U1 fresh learner | Newly registered local learner with onboarding completed; credentials are stored only in the local audit fixture | First-run and empty-state checks |
| U2 active learner | Existing acknowledged audit learner with three subjects and 365 study sessions per subject | Populated dashboard, analytics, history and planner checks |
| U3 edge learner | Second acknowledged audit learner, including empty and boundary records | Ownership, limits and negative-path checks |
| A1 administrator | Existing acknowledged super-admin fixture | Admin and role-boundary checks |

No credentials are published in this document. The fixture file is `.audit-local/fixtures.json` and is accepted only with the explicit current-database acknowledgement flag.

## Functional and integration cases

| ID | Area | Scenario and expected result | Status |
|---|---|---|---|
| AUTH-01 | Auth | Register a learner with valid data; account and session are created | PASS (automated) |
| AUTH-02 | Auth | Reject duplicate email and invalid password | PASS (automated) |
| AUTH-03 | Auth | Sign in valid learner and redirect to dashboard | PASS (automated/browser) |
| AUTH-04 | Auth | Invalid sign-in returns a safe error without session | PASS (automated) |
| AUTH-05 | Auth | Sign out clears session and protects private routes | PASS (automated/browser) |
| AUTH-06 | Auth | Forgot/reset token is single-use and expires | PASS (unit); email delivery not provisioned |
| AUTH-07 | Auth | Learner cannot access admin routes | PASS (route guards) |
| AUTH-08 | Auth | Admin can access admin routes and cannot be downgraded by client input | PASS (route/source checks) |
| ONB-01 | Onboarding | New learner completes onboarding and reaches dashboard | PASS (fresh fixture) |
| DASH-01 | Dashboard | Empty learner sees zero stats, CTA and readable footer | PASS (browser/visual audit) |
| DASH-02 | Dashboard | Active learner sees greeting, streak, study time and deadlines | PASS (production audit) |
| DASH-03 | Dashboard | Dashboard links use consistent destination and keyboard focus | PASS (browser/source audit) |
| SUB-01 | Subjects | Create subject with valid name/color | PASS (unit/API) |
| SUB-02 | Subjects | Edit subject and verify updated card/detail view | PASS (unit/API) |
| SUB-03 | Subjects | Delete subject cascades owned topics and sessions | BLOCKED (live ownership runner hung) |
| SUB-04 | Subjects | Duplicate/blank/overlong subject is rejected | PASS (validation tests) |
| STUDY-01 | Study | Start timer for a subject | PASS (unit/API) |
| STUDY-02 | Study | Pause/resume timer preserves elapsed time | PASS (unit/API) |
| STUDY-03 | Study | Stop timer creates a study session and clears active timer | PASS (unit/API) |
| STUDY-04 | Study | Repeated stop and stale timer requests are idempotent | PASS (unit) |
| STUDY-05 | Study | Timer belongs only to its owner | BLOCKED (live ownership runner hung) |
| HIST-01 | History | List, filter and paginate study sessions | PASS (unit/route) |
| HIST-02 | History | Edit/delete an owned session | PASS (unit/route) |
| HIST-03 | History | Invalid duration/date is rejected | PASS (validation tests) |
| PLAN-01 | Planner | Create one-time block from modal | PASS (calendar browser through create) |
| PLAN-02 | Planner | Create weekly recurring block | PASS (calendar browser through create) |
| PLAN-03 | Planner | Move one-time block and persist new time | PASS (calendar browser through move) |
| PLAN-04 | Planner | Failed move restores FullCalendar DOM position and offers retry | FIXED; browser rerun blocked later at resize harness |
| PLAN-05 | Planner | Resize block and persist duration | BLOCKED (harness observed server action/delete dialog) |
| PLAN-06 | Planner | Move recurring occurrence, one, future and all scopes | BLOCKED (same browser harness stop) |
| PLAN-07 | Planner | Delete/cancel one occurrence and retry failed delete | BLOCKED (same browser harness stop) |
| PLAN-08 | Planner | Month/week navigation uses cached range without duplicate fetch | BLOCKED (same browser harness stop) |
| ANA-01 | Analytics | Weekly/monthly totals and percentages are correct | PASS (13 analytics tests) |
| ANA-02 | Analytics | Empty and zero-denominator charts render safely | PASS (unit) |
| ANA-03 | Analytics | Analytics data is scoped to current learner | BLOCKED (live ownership runner hung) |
| LIB-01 | Library | List resources and filter by subject/type | PASS (route/unit) |
| LIB-02 | Library | Resource link validation rejects unsafe schemes | PASS (URL validation tests) |
| LIB-03 | Library | File upload creates pending object and signed access | PASS (storage integration) |
| SET-01 | Settings | Update profile/preferences/timezone | PASS (route/unit) |
| SET-02 | Settings | Invalid timezone and profile values are rejected | PASS (validation tests) |
| ADM-01 | Admin | View users, search and open user detail | PASS (production audit) |
| ADM-02 | Admin | Admin analytics and storage pages load with protected data | PASS (production audit) |
| API-01 | API | Unauthenticated private page redirects to login | PASS (browser/security) |
| API-02 | API | Unauthenticated calendar API returns 401 | PASS (direct check) |
| API-03 | API | Export and file routes do not disclose data without session | PASS (direct check) |
| API-04 | API | Health endpoint returns a minimal healthy response | PASS (direct check) |
| API-05 | API | Cross-origin requests do not receive wildcard allow-origin | PASS (direct check) |
| API-06 | API | Rate limits return a controlled failure after threshold | PASS (unit) |
| DB-01 | Database | Schema and migrations are internally consistent | PASS (`drizzle-kit check`) |
| DB-02 | Database | PostgreSQL, pool, seed user and six migrations are reachable | PASS (connection check) |
| DB-03 | Database | Foreign keys/cascade behavior for owned records | BLOCKED (live ownership runner hung) |
| STORE-01 | Storage | Anonymous read is denied | PASS (403) |
| STORE-02 | Storage | Signed upload/head/download works | PASS |
| STORE-03 | Storage | Tampered upload is rejected | PASS (403) |
| STORE-04 | Storage | Object access is owner-scoped | PASS (authorization test) |
| UI-01 | Responsive | Public and private routes render at 1280px and 1920px without overflow | PASS (production audit) |
| UI-02 | Responsive | Learner planner renders at 390px without horizontal overflow | BLOCKED after calendar harness resize phase |
| UI-03 | Typography | Inter, tokenized type scale, tabular numerals and contrast rules are present | PASS (source/lint/build) |
| UI-04 | Accessibility | Keyboard labels, dialog names, reduced-motion and alert states work | PASS for exercised public/calendar paths; full axe run not provisioned |
| REG-01 | Regression | Calendar failed-drag rollback calls FullCalendar `revert()` | FIXED; unit/build green |
| REG-02 | Regression | All existing Vitest and analytics/schedule suites remain green | PASS (177 Vitest + 13 analytics) |

