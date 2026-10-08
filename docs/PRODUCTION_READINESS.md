# Production readiness

## Evidence summary

| Measure | Result |
|---|---|
| Functional cases in matrix | 61 |
| Automated unit/route tests | 177 passed, 8 skipped |
| Analytics/schedule checks | 13 passed |
| Public browser E2E | Passed |
| Learner E2E | Skipped because `E2E_DATABASE_READY` is unset |
| Learner/admin production route audit | All listed routes passed |
| Build/lint/typecheck | Passed |
| Schema, DB and storage checks | Passed |
| Confirmed critical/high code defects | 0 confirmed after calendar rollback fix |
| Blocked release evidence | Ownership DB runner, learner E2E setup, calendar resize harness |

The matrix contains 61 cases. Statuses are shown per row; blocked rows are limited to the live ownership database runner, missing learner E2E configuration, and the calendar resize harness. This is a coverage accounting statement, not a claim that every user workflow was exercised end to end.

## Decision

**Not ready for an unconditional production sign-off.** The application builds and the executed paths are healthy, but release evidence is incomplete. Before approval:

1. Run ownership and cascade tests against a disposable seeded database until the runner completes.
2. Set `E2E_DATABASE_READY` and rerun learner registration, timer and mobile flows.
3. Update the calendar browser harness for the current resize/server-action interaction, then rerun the full calendar matrix and capture a passing artifact.
4. Configure and verify password-reset email, production secrets, backups, error monitoring and rate-limit storage in the deployment environment.

Once those gates complete without new defects, repeat the final regression round and attach the resulting artifacts to the release record.
