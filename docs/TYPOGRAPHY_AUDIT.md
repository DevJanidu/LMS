# StudyFlow typography and visual consistency

Date: 2026-10-10. The pass covers the shared system used by dashboard, subjects/detail, study/history, planner, analytics, library, settings, administration and public/authentication pages. No copy, features or page layout were redesigned.

## Initial source audit

Searched `src` and public assets for `font-family`, `fontFamily`, font imports, font utilities, arbitrary text sizes, weights and tracking. The previous application work already established Inter and most requested tokens; this pass completes their usage rather than introducing a second scale.

| Property | Distinct values at the start |
| --- | --- |
| Font family | Inter from `next/font/google`, exposed as `--font-sans`; `inherit` for controls, charts and calendar tables. No other imported family. |
| Font size | 11, 12, 13, 14, 16, 20, 28, 32px; responsive h1 24px and display 26px; browser root 100%. |
| Font weight | 400, 500, 600. No bold/700/800 utilities. |
| Letter spacing | −0.02em, −0.015em, −0.01em, −0.005em, 0, +0.06em. |
| Line height | Token values 16, 20, 22, 24, 28, 32, 36, 40px; calendar event overrides 1.35/1.15; icon wrapper 0 (non-text). |

All authored text utilities already used the requested names. Remaining defects were semantic/token selection, conflicting button typography, duplicate declarations and third-party inheritance. Sidebar icons were already 18px; they now use a named icon token.

## One source of truth

`src/app/globals.css` owns the Tailwind v4 typography tokens. Each utility carries its size, line-height, weight and tracking. Root layout retains the existing variable Inter configuration: Latin subset, swap display, `--font-sans`. Html/body apply Inter, cv11/ss01/tnum features, antialiasing and optimizeLegibility. Controls, options and tooltips inherit the family.

| Token | Desktop size / leading | Weight | Tracking |
| --- | --- | --- | --- |
| display | 32 / 40px | 600 | −0.02em |
| h1 | 28 / 36px | 600 | −0.015em |
| h2 | 20 / 28px | 600 | −0.01em |
| h3 | 16 / 24px | 600 | −0.005em |
| body | 14 / 22px | 400 | 0 |
| body-strong | 14 / 22px | 500 | 0 |
| small | 13 / 20px | 400 | 0 |
| caption | 12 / 16px | 500 | 0 |
| overline | 11 / 16px | 600 | +0.06em, uppercase |
| stat | 28 / 32px | 600 | −0.02em, tabular figures |

Below 640px display becomes 26px and h1 24px. Section gaps use 32px, card padding 24px and section heading/content gap 16px. Numeric timers, calendar dates, progress, stats, tables and charts retain tabular figures. Primary/secondary/muted text colors remain #0F172A/#475569/#64748B with existing dark equivalents; functional action/status and inverted hero colors remain intact.

## Before / after

| Before | After |
| --- | --- |
| Native headings without explicit classes depended on browser/Tailwind defaults. | Every heading has a semantic token default. Component-specific heading classes still apply. |
| Shared button size classes added `text-body` alongside body-strong. | Both button sizes declare body-strong consistently. Primary action height/padding/radius remain shared. |
| Subject metadata was forcibly reduced from caption to 11px; cards used four sizes including an overline. | Metadata is 12px caption. The next-topic helper is a sentence-case caption, leaving three sizes: 16px title, 14px body/link, 12px metadata. Copy unchanged. |
| Library rows combined a type overline, small metadata, title and body actions, with 20px padding. | Type/metadata use caption, actions body-strong, title h3 and padding 24px; three text sizes per row. |
| Today's stat label was an overline unlike other stat labels. | Stat label is caption, with existing stat number and 8px rhythm. |
| First admin stat number was overridden to 14px body. | All admin stat numbers use the stat token. |
| Public-page supporting prose used uppercase overline typography. | Supporting prose uses body; uppercase overlines remain labels. |
| Calendar event containers used ad-hoc unitless leading. | Calendar event text and table inherit the caption token; tiny-event clipping/behavior is unchanged. |
| Search keyboard hint repeated its font-family declaration. | It inherits the global font rule. |
| Overline muted color depended on consumers. | Shared overline utility supplies the muted color; explicit inverted hero styles remain white. |
| Some card helpers introduced a fourth size alongside heading/body/chart labels. | Shared panels use caption-sized helpers; the admin notice uses body. |
| Accessible chart data rows inherited the admin table's 13px rule, introducing a fourth size in some chart cards. | Chart data cells use caption. Axis tooltips/legends also explicitly share the caption and inherited Inter. DOM inspection identified the table-cell override; the expanded browser audit reproduced it and the affected pages were retested. |
| Several top-level sections used 24px/28px gaps. | Subject/library/history/analytics/admin section spacing is 32px, with existing columns preserved. |

Shared text actions retain `TextLink` (14px/500, one action color and directional arrow); page/section headings, footer text and spacing were already standardized and were verified rather than gratuitously redesigned.

## Hero and text contrast

The existing hero has three type levels: display greeting, body supporting copy and overline labels/badge. White text and a soft shadow sit above the existing dark gradient. At its weakest opacity (62% #0F172A), even a pure-white source image yields **5.02:1** white-text contrast. All darker gradient positions exceed that lower bound. Muted #64748B on white yields **4.76:1**. Both exceed 4.5:1; no image or marketing copy was changed.

## Validation

`scripts/typography-audit.mjs` discovers page routes from the source-derived mutation inventory, signs into existing audit learner/admin accounts, and performs read-only checks in Chrome at 1280px, 1920px and 390px, in light and dark themes. It checks computed font families, allowed sizes/weights/tracking, text links, subject/stat/panel/today/library card size counts, sidebar rhythm, responsive hero size and horizontal overflow. Screenshots remain in ignored `.audit-local/typography`; sanitized machine results are in [TYPOGRAPHY_RESULTS.json](TYPOGRAPHY_RESULTS.json).

Onboarding steps and password-reset token states share the audited public/form system and were reviewed in source. Their special state flows are not browser-certified by completed fixture accounts. No learner records or shared platform settings were mutated. Native operating-system select menus/tooltips cannot be certified by DOM computed-style checks.

Final `npm.cmd run build` passed, including TypeScript and all 120 static pages. Final `npm.cmd run lint` passed with no warnings. The browser matrix finished with **132 passing checks across 22 pages**, zero failures and zero runtime errors. Both themes and all three viewport widths passed. After reproducing the admin chart-card inconsistency, the affected overview/detail pages and final Library version were rerun; the linked JSON contains the reconciled complete matrix.

## Files changed

- `src/app/globals.css`: semantic heading defaults, inherited option font and overline muted color.
- `src/app/workspace.css`: caption-based subject/calendar/card-helper text, admin stat/public body fixes, named navigation icon size and redundant font cleanup.
- `src/components/ui/button/Button.tsx`: consistent 500-weight button typography.
- `src/components/subjects/SubjectCard.tsx`: three-level card typography.
- `src/components/dashboard/Dashboard.tsx`: consistent stat label.
- Subjects, Resources, StudyHistory, Analytics and admin page components: shared 32px section rhythm.
- `scripts/typography-audit.mjs`, `docs/TYPOGRAPHY_RESULTS.json`, this report: reproducible browser coverage and evidence.
