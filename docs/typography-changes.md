# StudyFlow typography and consistency pass

Applied across Home, Subjects, Study, Study Planner, Analytics, Library and Settings, including shared forms, dialogs, loading states, authentication and admin components. Existing unrelated workspace changes were preserved.

## Before and after

| Before | After |
| --- | --- |
| Local Geist and legacy Arial stack | Variable Inter via next/font/google; latin subset; swap; --font-sans |
| Scattered sizes and heading tracking down to -0.06em | Ten tokens in globals.css; tracking no tighter than -0.02em; mobile display 26px and h1 24px |
| Dashboard links at 12–14px, mixed arrow glyphs | Shared TextLink, 14px/500, semantic accent color and RTL-aware ArrowRightIcon |
| Section titles at 18–20px with separate overrides | h2, 20px/28px/600; consistent 16px heading gap |
| Different primary action sizes and corner radii | 44px tall, 14px/500, 16px inline padding, 8px radius |
| Uneven numeric hierarchy and proportional digits | 28px/32px stat values, caption labels, tabular digits for stats, timers, weeks, percentages and charts |
| Faint neutral copy and footer | Three semantic text colors: primary #0F172A, secondary #475569, muted #64748B; theme-aware dark equivalents |
| Washed-out sunset copy | White text with text shadow and dark gradient; worst-case white-image contrast 5.02:1 |
| Fractional spacing and inconsistent card insets | 4px spacing grid, 24px card padding, 32px section and collection gaps |

The hero uses three text sizes (display, body, overline) while preserving all existing copy. Subject cards retain three sizes by sharing the overline size for compact metadata.

## Validation

- npm run build: passed, including TypeScript and all 118 generated pages.
- npm run lint: passed.
- Browser checks: 21 combinations across 1280px, 1920px and 390px on localhost:3000.
- A fresh test learner account was registered and onboarded through the app. Earlier checks also covered populated subject cards and recent sessions with an existing audit learner.
- Assertions passed for Inter, supported sizes and weights, consistent 14px/500 text links, at most three sizes per checked card, and no horizontal page overflow.
- Browser runtime errors: 0. Dark mobile screenshots also reviewed for Home, Planner, Analytics and Settings.
- Screenshots and computed styles: .audit-local/typography/ (local, ignored artifacts).
- Full before inventory: typography-audit.md.

## Files touched by the typography pass

Some files below already contained uncommitted feature work. This pass changes their typography and spacing classes.

- **src/app/[locale]/(public)**: `layout.tsx`.
- **src/app/[locale]/(public)/privacy**: `page.tsx`.
- **src/app/[locale]/(public)/terms**: `page.tsx`.
- **src/app/[locale]**: `layout.tsx`.
- **src/app**: `globals.css`, `workspace.css`.
- **src/components/admin**: `AdminOperations.tsx`, `AdminOverview.tsx`, `AdminSettings.tsx`, `AdminStorage.tsx`, `AdminUserDetail.tsx`, `AdminUsers.tsx`, `UserStatusAction.tsx`.
- **src/components/analytics**: `Analytics.tsx`, `HeatmapCalendar.tsx`, `LearningInsights.tsx`, `StreakBadge.tsx`, `StudyChart.tsx`.
- **src/components/auth**: `AuthForm.tsx`.
- **src/components/calendar**: `CalendarDeleteTarget.tsx`, `ScheduleDateTimeField.tsx`, `StudyBlockDetails.tsx`, `StudyBlockModal.tsx`, `StudyCalendar.tsx`.
- **src/components/common**: `ComponentCard.tsx`, `PageBreadCrumb.tsx`.
- **src/components/dashboard**: `Dashboard.tsx`, `TodayPlan.tsx`, `WeeklyJourney.tsx`.
- **src/components/form**: `ComboboxField.tsx`, `DatePickerField.tsx`, `Label.tsx`, `NumberInput.tsx`, `SelectField.tsx`.
- **src/components/form/input**: `InputField.tsx`.
- **src/components/onboarding**: `OnboardingWizard.tsx`.
- **src/components/resources**: `NotePreview.tsx`, `ResourceModal.tsx`, `Resources.tsx`.
- **src/components/settings**: `Settings.tsx`.
- **src/components/study**: `SessionModal.tsx`, `SessionTable.tsx`, `TimerWidget.tsx`.
- **src/components/studyflow**: `ConfirmDialog.tsx`, `EmptyState.tsx`, `ErrorPage.tsx`, `FormFields.tsx`, `PageHeader.tsx`, `Pagination.tsx`, `StatTile.tsx`, `TextLink.tsx`, `WorkspaceHeader.tsx`, `WorkspaceShell.tsx`, `WorkspaceShellLoading.tsx`, `styles.ts`.
- **src/components/subjects**: `SubjectCard.tsx`, `SubjectDetail.tsx`, `SubjectModal.tsx`, `SubjectOverview.tsx`, `TopicList.tsx`.
- **src/components/ui**: `Calendar.tsx`, `Popover.tsx`, `Select.tsx`.
- **src/components/ui/badge**: `Badge.tsx`.
- **src/components/ui/button**: `Button.tsx`.
- **src/components/ui/modal**: `index.tsx`.

New documentation: docs/typography-audit.md and docs/typography-changes.md.
