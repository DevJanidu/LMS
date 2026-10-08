# Bug report

## BUG-001 — failed calendar drag did not restore the event DOM position

**Severity:** High for planner trust, fixed in the working tree.

**Reproduction:** On the planner, drag a one-time event while the save endpoint returns HTTP 503. The store rollback restored its snapshot, but FullCalendar retained the optimistic vertical position.

**Root cause:** The React calendar store and FullCalendar maintain separate optimistic views. Rolling back the store does not move FullCalendar's owned event element.

**Fix:** The non-recurring move handler now calls the supplied FullCalendar `revert()` callback when `store.mutate()` resolves false, while retaining the existing success message path.

**Evidence:** The original browser audit failed at the position assertion. After the patch, the rerun passed the failed-move position assertion and continued to the resize phase. Unit tests, lint, typecheck and production build pass.

## Open verification gaps

| ID | Severity | State | Action |
|---|---|---|---|
| QA-001 | High assurance gap | Ownership integration runner hangs against the acknowledged current DB | Run against a disposable seeded test database and capture cross-user/cascade results |
| QA-002 | Medium | Learner registration/timer browser test skipped without `E2E_DATABASE_READY` | Provision isolated E2E DB and rerun |
| QA-003 | Medium | Calendar browser harness stops at resize after observing a server-action request and delete dialog | Update harness to target the current FullCalendar interaction and response contract, then rerun |
| QA-004 | Low | Prettier check reports 161 files | Apply formatting as a separate controlled change if repository policy requires it |
| OPS-001 | Medium | Password-reset email delivery is not configured in this local run | Configure provider and verify end-to-end email/token flow |

No confirmed critical production code defect remains from the executed checks. The open items are proof/configuration gaps until rerun in the appropriate environment.

