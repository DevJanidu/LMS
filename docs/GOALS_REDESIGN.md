# Goals workspace redesign

## Audit

- The simple detail view repeated the title in a goal card, then hid the advanced interface behind an optional study-plan accordion.
- Both detail components owned independent mutation state, so a task update could leave the visible summary stale.
- Goal cards exposed only their title as a link and omitted calculated progress and the next task.
- The list displayed only two oversized metrics and offered neither progress nor recently-updated sorting.
- Tasks displayed descriptions, evidence and actions on every row. Milestones were permanently expanded, with repeated large containers.
- The right column repeated deadlines, next steps and links across five panels, including empty panels.

## Implementation principles

Use one detail state and the existing versioned, account-scoped mutation API. Preserve dependency-aware progress calculations and server-confirmed completion. Use compact tasks, collapsed milestone details, four immediately available sections, and one contextual Aven panel. Cards use a stretched semantic link with sibling controls. Sorting applies across the filtered result set before pagination; KPIs are account-wide and come from stored records. No schema migration or dependencies are needed.

## Delivered

- Four compact account-wide metrics, combined search/status filters, and deadline/progress/recently-updated sorting. Filters survive refresh and return navigation.
- Fully clickable semantic goal cards with progress, task counts, deadline, health and a next step; sibling controls remain independent.
- One goal detail state with Overview, Tasks, Milestones and Study Plan sections. Overview exposes pending tasks immediately; the former top-level accordion and repeated title card are gone.
- Compact task rows with expandable details, milestone grouping, filters, versioned optimistic completion and rollback, and the existing creation/edit/delete/study/habit flows.
- Collapsed milestone roadmap, optional advanced editor fields, contextual Aven guidance, linked learning and retained activity/evidence controls.
- Upcoming recurring study sessions use the planner's occurrence logic, including moved and cancelled dates. Goal and task context for new Aven links is retrieved by owned IDs on the server.
- Matching loading skeletons, keyboard-operable tabs and menus, larger checkbox tap areas, light/dark surfaces and reduced-motion styles.

## Executed verification

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, Next.js 16.3.8 / Turbopack |
| `npm run test:unit` | 374 passed; 53 conditional integration/provider cases skipped |
| Goals/Aven database verification | 12 original cases passed in the initial run; the budget case passed after correcting its stale test token limit; new progress-pagination and recurrence cases passed in focused runs |
| Production-browser functional audit | 11 check groups passed; no unexpected console/runtime errors |
| Responsive screenshots | Goal detail checked at 1440, 1024, 768 and 390 pixels in light/dark; list checked in both themes on desktop/mobile |

The browser audit exercised accurate KPIs, independent card controls, card-surface navigation, visible initial tasks, completion/reopening, refresh persistence, failed-save rollback, task creation/edit/delete, default collapsed milestones, expansion, secure Aven links, study-plan empty states, selected-section persistence, browser back navigation, combined filters and filtered empty states. The intentionally mocked HTTP 409 is expected during rollback verification.

The prior budget test used the fixed non-reasoning output limit. It now uses `avenConfig().maxOutputTokens`, matching existing reservation behavior. Production budget logic was not changed. Database and browser checks created only owned disposable records and removed them afterwards. No paid AI requests were made.

Scripts: `scripts/goals-database-check.mjs`, `scripts/goals-browser-audit.mjs`, `scripts/goals-visual-audit.mjs`. Local screenshots and reports are under the ignored `.audit-local/goals-redesign/` directory. The functional report is `report.json`; the final detail visual report is `visual-report.json`.

## Sidebar logo follow-up

The expanded brand link is centered independently of the mobile close button. The collapsed sidebar uses a separate mark frame that crops above the wordmark and retains the complete A and star. The same mark rendering also serves the mobile header. Browser checks passed for expanded/collapsed desktop, collapsed-state restoration after refresh, and mobile drawers in both themes: one visible logo, center offset below one pixel, and no navigation/close-button overlap. Build, lint and 14 targeted UI/translation tests passed after this change. Local screenshots are in `.audit-local/sidebar-logo/`.
