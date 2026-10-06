# StudyFlow UI delivery

## Routes

All page source files live beneath `src/app/[locale]`. The default locale has no URL prefix.

| Area                    | Created or rebuilt routes                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Learner                 | `/dashboard`, `/subjects`, `/subjects/[id]`, `/study`, `/study/history`, `/calendar`, `/analytics`, `/resources`, `/settings` |
| Onboarding              | `/onboarding`, `/onboarding/context`, `/onboarding/subject`, `/onboarding/topics`, `/onboarding/goal`                         |
| Auth preview            | `/login`, `/register`, `/forgot-password`, `/reset-password`                                                                  |
| Super Admin             | `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/analytics`, `/admin/storage`, `/admin/settings`                        |
| Errors and legal drafts | `/error-404`, `/error-500`, `/terms`, `/privacy`; localized not-found and inherited error boundaries                          |
| Entry                   | `/` redirects to `/dashboard`                                                                                                 |

The following old demo routes were removed: `/signup`, `/signin`, `/videos`, `/modals`, `/images`, `/buttons`, `/badge`, `/avatars`, `/alerts`, `/profile`, `/blank`, `/basic-tables`, `/form-elements`, `/line-chart`, `/bar-chart`. The ecommerce home at `/` was replaced by the redirect. `/calendar` and `/error-404` were rebuilt. The Pro-only SaaS, invoice, CRM, AI, logistics, pricing and other routes named in the prompt were not present in this free-template checkout; none remain in the final navigation or route tree.

## Shared components

| Folder                  | New components                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/studyflow`  | PageHeader, ProgressBar, StatTile, EmptyState, LoadingSkeleton, ErrorState, ErrorPage, ConfirmDialog, FormFields, ActiveTimerIndicator, WorkspaceShell |
| `components/subjects`   | SubjectCard, SubjectModal, TopicList, Subjects, SubjectDetail                                                                                          |
| `components/study`      | StudySelectors, TimerWidget, SessionTable, SessionModal, StudyHistory                                                                                  |
| `components/calendar`   | StudyCalendar, StudyBlockModal                                                                                                                         |
| `components/analytics`  | StudyChart, HeatmapCalendar, StreakBadge, Analytics                                                                                                    |
| `components/resources`  | ResourceModal, Resources, NotePreview                                                                                                                  |
| `components/settings`   | Settings                                                                                                                                               |
| `components/onboarding` | OnboardingWizard                                                                                                                                       |
| `components/auth`       | AuthForm                                                                                                                                               |
| `components/admin`      | AdminOverview, AdminUsers, AdminUserDetail, AdminAnalytics, AdminStorage, AdminSettings, UserStatusAction                                              |

The template's ComponentCard, Button, InputField, Label, Table and Badge are reused. Its Modal now uses native dialog focus trapping and Escape/focus restoration. PageBreadCrumb is localized and RTL safe. ThemeContext and SidebarContext remain the shared contexts. ApexCharts and FullCalendar v7 are dynamically loaded; the latter's required stylesheets are explicitly imported. No packages or second UI library were added.

Unused demo components, icons, 113 template asset files, promotional content and obsolete third-party styles were removed. The source dependency audit reports no unreachable TypeScript component/module files. The upstream license and original baseline commit are preserved.

## Mock data and behavior

- Typed User, Subject, Topic, Resource, StudySession, ScheduleBlock, ScheduleException, Notification, AuditLog and platform settings records.
- Query-shaped access functions in `src/lib/mock/index.ts`; browser persistence in `src/lib/mock/store.ts`; calculations in `src/lib/analytics`.
- Mathematics, Algorithms and AWS examples; AWS starts at 7/10 completed (70%); three weeks of learner sessions.
- Subject/topic management, completion, ordering and bulk entry update progress immediately. Deleting a subject removes its dependent mock records.
- One timestamp timer persists across navigation, refresh and reopening. Pause time is excluded; sub-minute sessions are not saved; unattended sessions pause at the six-hour checkpoint.
- Manual session changes update dashboard, history and analytics. Valid time is allocated across local calendar-day boundaries. For paused sessions spanning midnight, the recorded duration is distributed proportionally across their elapsed span because the SRS session record stores no pause intervals.
- Calendar recurrence uses the block's timezone, supports one-occurrence exceptions and future-series splits, preserves overnight ends and warns on overlaps.
- Resource URL/type/size checks, subject/topic filters, YouTube thumbnails and basic note headings/lists/bold formatting. File selections retain metadata only.
- Preferences, in-app reminders derived from current blocks/deadlines, account data export/deletion previews, and a skippable onboarding wizard.
- Admin statistics omit notes, file contents and session note text. Status changes and settings updates create mock audit entries. Users can be exported as CSV.

## Verification

- `npm test`: 13 passing analytics/recurrence tests, plus matching message-key checks across four locales and validation of literal translation references.
- `npm run lint`: passes with no errors or warnings.
- `npm run build`: passes, including strict TypeScript and prerendering.
- `node scripts/browser-check.mjs`: all 28 product routes checked in local Chrome. Verified subject/topic creation and completion, timer navigation/refresh/pause/resume, short and valid sessions, manual entry, the six-hour cap, recurring occurrence editing, custom blocks without subjects, resource notes, oversized file feedback, admin deactivation/auditing, private-content exclusion, dark mode and RTL.
- Checked the main learner/admin screens at 360 px with no document overflow. Browser console has no errors or warnings in the exercised flows.
- Screenshots: `docs/screenshots/dashboard-desktop.png`, `dashboard-mobile.png`, `calendar-mobile.png`, `dashboard-rtl.png`, `dashboard-dark.png`.

These checks cover Chrome's desktop/mobile emulation. A full assistive-technology audit and physical Safari/Firefox/device testing have not been performed.

## Assumptions and limits

1. This is the requested front-end preview. No real authentication, protected-role checks, database, emails, signed files or uploads are implemented. Admin routes are available for preview; the role switch link appears only in development.
2. Mock data is browser-local and survives refresh. File bytes and passwords are never saved. A real file cannot be opened from metadata alone; the UI explains this.
3. The actual template enabled English only. English copy is complete; Arabic, Spanish and German have matching keys and translated core navigation, with remaining copy still in English. Arabic layout is RTL. Additional translation review remains.
4. Terms and Privacy Policy are visibly marked drafts. No minimum age, parental-consent policy, launch country or real Google login decision was invented.
5. Calendar blocks can be moved through their date/time editor; optional drag-to-move is not implemented.
6. The seeded longest streak is 18 days of earlier history, while the visible seed covers three weeks. Weekly totals are calculated from sessions rather than hardcoded to the illustrative 8h 30m figure.
7. Branding uses the single `APP_NAME` constant in `src/lib/constants.ts`, with friendly indigo theme tokens and a simple book favicon.
8. There was no Git repository initially. A baseline commit was created, followed by the ten requested implementation stages. No deployment was requested or performed.

## Run locally

```sh
npm run dev
```

Open `/dashboard` for the learner workspace or `/admin` for the admin preview.
