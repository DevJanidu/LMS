# MASTER PROMPT — FULL PROJECT AUDIT, REAL-USER TESTING & PRODUCTION READINESS

You are acting as a **Senior QA Automation Engineer, Senior Full-Stack Engineer, Security Engineer, and Production Release Auditor**.

Your mission is to thoroughly inspect, test, debug, and validate this entire application as if it were about to be released to thousands of real customers.

**Do not assume any feature works simply because the code looks correct. Every important feature must be tested through actual execution.**

## PHASE 1 — UNDERSTAND THE ENTIRE PROJECT

Before making any changes:

1. Read and understand the complete project structure.
2. Identify the frontend, backend, database, authentication, and external integrations.
3. Inspect all pages, layouts, components, API routes, server actions, services, database models, and middleware.
4. Identify all user roles and their permissions.
5. Identify every feature available to a user.
6. Identify every CRUD operation across the application.
7. Understand the complete user journey from registration to regular daily usage.
8. Identify dependencies between features and database records.

Do not skip features because they appear simple.

Create a file:

`docs/COMPLETE_TEST_CASES.md`

Document every discovered feature and its test cases.

Each test case must contain:

- Unique test case ID
- Feature/module name
- Test scenario
- Preconditions
- Test steps
- Dummy test data
- Expected result
- Actual result
- Pass/fail status
- Severity if failed

Include positive, negative, boundary, integration, security, and regression scenarios.

## PHASE 2 — CREATE THREE REALISTIC TEST USERS

Create three independent test accounts with separate data.

**USER 1 — New User**

Simulate someone who has never used the application.

- Register a new account.
- Complete onboarding.
- Explore every available page.
- Create their first records.
- Edit records.
- Delete records.
- Test empty states and validation.
- Log out and log back in.
- Verify their data persists.

**USER 2 — Active Daily User**

Simulate an existing customer who uses the application extensively.

- Populate all applicable modules with realistic dummy data.
- Create large numbers of records.
- Perform repeated CRUD operations.
- Navigate between pages frequently.
- Use filters, sorting, searching, and pagination.
- Test calendars, scheduling, drag-and-drop, and recurring events where available.
- Test rapid consecutive interactions.
- Refresh pages during and after operations.
- Verify data consistency across related features.

**USER 3 — Edge-Case / Stress User**

Simulate a customer who uses the application unpredictably.

- Submit invalid inputs.
- Leave optional fields empty.
- Test maximum and minimum values.
- Use special characters and Unicode.
- Click buttons rapidly.
- Submit forms multiple times.
- Refresh during saving.
- Navigate away with unsaved changes.
- Open multiple browser tabs.
- Attempt conflicting edits.
- Test expired sessions.
- Test unauthorized access.
- Simulate network delays and failures.
- Attempt to access another user's data.

**Important:** All three users must have isolated data. User A must never be able to read, edit, or delete User B's private records.

If the application supports additional roles, test the appropriate permission boundaries for those roles as well.

## PHASE 3 — TEST EVERY FEATURE AND CRUD OPERATION

For EVERY module discovered in the project, execute the following applicable tests.

### CREATE

- Create valid records.
- Submit incomplete forms.
- Submit invalid values.
- Test required-field validation.
- Test duplicate submissions.
- Test double-clicking submit.
- Test very long input values.
- Test server-side validation.
- Verify records are saved correctly.
- Verify the UI updates immediately and accurately.
- Verify related data updates correctly.

### READ

- Verify records display correctly.
- Test empty states.
- Test loading states.
- Test filtering.
- Test searching.
- Test sorting.
- Test pagination.
- Verify correct data ownership.
- Test refresh and navigation.
- Verify frontend values match database values.

### UPDATE

- Update every editable field.
- Save changes and refresh.
- Verify persistence.
- Test invalid updates.
- Test cancel behavior.
- Test simultaneous updates.
- Test related-record synchronization.
- Verify updates do not create duplicate records.

### DELETE

- Delete individual records.
- Test cancellation of deletion.
- Verify database deletion behavior.
- Test deletion of records with dependencies.
- Verify related data remains consistent.
- Test repeated delete requests.
- Test unauthorized deletion attempts.
- Verify deleted records no longer appear where inappropriate.

Never report CRUD as fully working unless all applicable operations have been executed and verified.

## PHASE 4 — REAL BROWSER END-TO-END TESTING

Use Playwright or an equivalent browser automation framework.

Test the application through the actual user interface, not only API calls or unit tests.

For each of the three users:

1. Open the application in a browser.
2. Authenticate using the test account.
3. Navigate through all available sections.
4. Interact with forms, buttons, dropdowns, dialogs, calendars, and other controls.
5. Create realistic dummy data.
6. Edit existing data.
7. Delete data.
8. Refresh and verify persistence.
9. Log out and log back in.
10. Verify the final application state.

Run tests on desktop and mobile viewports.

Verify:

- No broken buttons.
- No dead links.
- No unexpected page reloads.
- No flickering or disappearing popovers.
- No broken dropdown positioning.
- No unusable date/time pickers.
- No incorrect loading indicators.
- No missing success/error feedback.
- No unexpected horizontal overflow.
- No browser console errors.
- No unhandled runtime exceptions.
- No failed API requests during successful workflows.

For calendars or scheduling systems, specifically test moving events between days, resizing, recurring schedules, deletion, timezone correctness, and rollback after failed saves.

## PHASE 5 — DATABASE AND BACKEND INTEGRITY

Inspect and test:

- Database schema and relationships.
- Foreign key constraints.
- Unique constraints.
- Transactions.
- API authorization.
- Server-side input validation.
- Error handling.
- Race conditions.
- Duplicate requests.
- Concurrent writes.
- Data isolation.
- Pagination efficiency.
- Query performance.
- Database connection handling.

After important operations, verify the database state directly using safe read-only checks.

Never rely exclusively on frontend success messages.

## PHASE 6 — SECURITY TESTING

Test all applicable security boundaries.

Include:

- Authentication and session management.
- Authorization and role-based access.
- Cross-user data isolation.
- IDOR vulnerabilities.
- SQL injection protection.
- XSS protection.
- CSRF protection where applicable.
- Input validation.
- Rate limiting.
- Password reset flows.
- Session expiration.
- Secure cookie configuration.
- Secret exposure.
- File upload restrictions.
- Protected API endpoints.

Never expose production credentials or real customer information in reports.

## PHASE 7 — PERFORMANCE AND RELIABILITY

Test realistic application performance.

Measure:

- Initial page loading.
- Client-side navigation.
- API response times.
- Database query latency.
- Form submission time.
- Record creation/update/deletion latency.
- Calendar interaction responsiveness.
- Search and filter responsiveness.
- Performance with larger datasets.
- Memory and resource usage where measurable.

Check for:

- N+1 queries.
- Unnecessary full-page refetches.
- Duplicate network requests.
- Excessive rerenders.
- Blocking operations.
- Slow database queries.
- Inefficient data fetching.
- Missing loading states.
- Race conditions.

Record actual measurements and test conditions. Do not invent benchmark results.

## PHASE 8 — AUTOMATIC BUG FIXING AND REGRESSION TESTING

When a defect is found:

1. Reproduce the issue reliably.
2. Identify the root cause.
3. Classify its severity.
4. Implement the smallest safe, maintainable fix.
5. Add an automated regression test.
6. Run the failing test again.
7. Run related integration and end-to-end tests.
8. Verify that the fix did not break existing features.
9. Document the fix.

Prioritize critical and high-severity defects.

Do not rewrite working features unnecessarily. Preserve the current application design, business rules, and architecture unless changes are required for correctness, security, or performance.

Do not silently change expected product behavior.

## PHASE 9 — REPEAT TESTING UNTIL STABLE

Perform at least three validation rounds:

**Round 1 — Discovery**

Execute the complete test suite and identify defects.

**Round 2 — Fix Verification**

Retest fixed defects and affected features.

**Round 3 — Final Regression**

Repeat all critical user journeys with all three test users.

Continue fixing and retesting failures where feasible.

Never change a failed result to passed without successfully rerunning the test.

## PHASE 10 — FINAL PRODUCTION READINESS REPORT

Generate these files:

1. `docs/COMPLETE_TEST_CASES.md`
2. `docs/TEST_EXECUTION_RESULTS.md`
3. `docs/BUG_REPORT.md`
4. `docs/PERFORMANCE_REPORT.md`
5. `docs/SECURITY_AUDIT.md`
6. `docs/PRODUCTION_READINESS.md`

The final report must include:

| Metric | Result |
|---|---|
| Total features discovered | Actual count |
| Total test cases | Actual count |
| Tests passed | Actual count |
| Tests failed | Actual count |
| Tests blocked/not executed | Actual count |
| Critical bugs remaining | Actual count |
| High-severity bugs remaining | Actual count |
| CRUD coverage | Actual percentage |
| E2E coverage | Actual measured scope |
| Security findings | Actual findings |
| Production readiness | READY / NOT READY |

Provide a module-by-module breakdown.

For every unresolved issue, provide severity, reproduction steps, affected functionality, and recommended remediation.

## IMPORTANT EXECUTION RULES

- Do not stop after reading the code.
- Do not stop after writing test cases.
- Actually execute the tests.
- Use three independent realistic user accounts.
- Test frontend, backend, and database together.
- Verify real database persistence.
- Test every accessible feature and applicable CRUD operation.
- Use dummy data only.
- Use an isolated test database and environment.
- Never modify or delete production/customer data.
- Do not trigger real payments, emails, SMS, or other chargeable external actions; use sandbox services and mocks.
- Obtain approval before destructive migrations or irreversible operations.
- Do not mark tests as passed based only on code inspection.
- Clearly identify tests that could not be executed.
- Do not fabricate screenshots, measurements, or test results.
- Do not claim 100% coverage without evidence.
- Do not declare production readiness while critical or high-severity defects remain unresolved.

**FINAL OBJECTIVE**

Treat this application as a real commercial SaaS product about to launch.

Your goal is to identify and fix defects before real customers encounter them.

Work systematically through discovery, test design, test execution, debugging, regression testing, and final verification.

**Start by analyzing the entire existing project. Build the complete test inventory first, then execute the tests and fixes. Do not ask for confirmation between ordinary testing phases. Only request approval when a destructive, security-sensitive, or irreversible action requires it.**

At the end, provide an evidence-based answer to this question:

**"Is this application genuinely ready for production use by real paying customers? If not, exactly what is preventing release?"**