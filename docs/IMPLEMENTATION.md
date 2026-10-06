# StudyFlow UI conversion

## Audit

The actual checkout is TailAdmin's free Next.js 16 template, rather than the full Pro SaaS demo. It has an ecommerce home, AppSidebar/AppHeader, profile, calendar, chart demos, basic tables, form demos, UI demos, sign-in/sign-up, and a 404. ApexCharts and FullCalendar v7 are already installed. Reusable primitives include ComponentCard, Button, Badge, Modal, Table, Dropdown, Label and Input. ThemeContext and SidebarContext already exist. The checkout initially supports English only despite the supplied repo guide listing four locales.

## Mapping

1. Preserve the template in Git; centralize StudyFlow branding and metadata.
2. Replace demo routes with localized learner, admin and public route groups. Keep the existing theme and sidebar contexts.
3. Create typed data-access functions and a browser mock adapter, then dashboard summaries.
4. Subjects/topics, persistent timestamp timer/history, calendar recurrence, analytics/resources/settings, onboarding/auth, and admin statistics.
5. Remove unused demo code/assets, test calculations and validate build/lint.

No backend, authentication, uploaded file storage, new packages, or deployment is included. All account/role actions are explicitly mock previews. Files retain metadata only. Legal text is a UI draft pending the owner's launch decisions.

## Verification

See the final delivery report for commands, route inventory, assumptions and verification limits.
