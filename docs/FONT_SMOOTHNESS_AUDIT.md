# Inter rendering and smoothness

Date: 2026-10-10. Tested in Chrome on Windows at localhost:3000, 100% zoom and device scale factor 1.

## Root cause reproduced

Computed font-family was `Inter, Inter Fallback`, but Chrome's actual Rendered Fonts reported **Arial** on dashboard headings, body, links and stats. The development font CSS contained only Next's Arial-based fallback face and no downloadable Inter face. The production CSS contained the actual Inter variable faces. This explains why a computed-style-only audit previously passed while the displayed type was wrong.

The development cache was regenerated and the server restarted. A missing existing native authentication dependency surfaced on fresh compilation; `npm ci --no-audit --no-fund` restored the existing lockfile dependencies without adding packages or changing authentication. The restarted server now serves its local Inter WOFF2 asset with HTTP 200. Decorative command/check/diagonal-arrow symbols were replaced by matching SVGs to avoid Cambria/Segoe symbol fallback. The keyboard hint's inherited Tailwind monospace rule was explicitly overridden with font inheritance.

The earlier baseline is preserved in [FONT_SMOOTHNESS_BASELINE.json](FONT_SMOOTHNESS_BASELINE.json). The new audit uses `CSS.getPlatformFontsForNode`, the Chrome DevTools Protocol equivalent of Rendered Fonts, rather than inferring success from a CSS family name. Dynamic chart nodes are recaptured when they change during measurement; missing nodes are not silently skipped.

## Final design system

Variable Inter uses `next/font/google`, Latin subset, swap display and no fixed weights. Html receives `inter.variable` and `font-sans`; body has the requested system fallback stack for loading/unavailable-font conditions. All controls, headings, code/keyboard text and third-party labels inherit Inter. Font synthesis is disabled. Antialiasing, grayscale smoothing, optical sizing and cv11/ss01 are enabled. Rasterization still depends on the operating system/browser; CSS smoothing properties do not override Windows' rendering engine.

| Role | Desktop size / leading | Weight | Tracking |
| --- | --- | --- | --- |
| Hero | 32 / 40px | 600 | −0.01em |
| Page title | 26 / 34px | 600 | −0.01em |
| Section heading | 18 / 26px | 600 | −0.005em |
| Card title | 15 / 22px | 600 | 0 |
| Body | 14 / 22px | 400 | 0 |
| Links/buttons/navigation | 14 / 20px | 500 | 0 |
| Secondary/date text | 13 / 20px | 400 | 0 |
| Small labels | 12 / 16px | 500 | 0 |
| Stats/percentages | 24 / 30px | 600 | 0 |

Uppercase labels use +0.05em tracking. Existing mobile display/page-title sizes remain 26/24px. Body/secondary colors are #1E293B/#64748B in light mode; existing dark colors, action colors and hero inversion are preserved. Numeric selectors carry tabular figures; prose, whole tables, charts and week containers no longer enable them globally. Page structure, copy and interactions remain intact. This scale follows the latest supplied specification, including distinct stat/date/label sizes, rather than the previous card-size-count restriction.

## Executed validation

- `node scripts/font-rendering-audit.mjs`: **28 PASS**, zero failures/runtime errors, covering Home, Subjects, Study, Study Planner, Analytics, Library and Settings at 1280px and 390px in light/dark themes.
- 2,128 text/control element observations; all reported rendered font families are **Inter**. No Arial, Consolas or other fallback was reported for the sampled app glyphs. Controls without drawable glyphs can return no platform-font record; their computed inheritance is recorded separately.
- Zoom 1, font-synthesis none, optical sizing auto, global features cv11/ss01, only 400/500/600 weights and the requested token sizes verified. No horizontal overflow. Screenshots inspected for desktop dashboard and mobile subjects.
- Final `npm.cmd run lint`: PASS, zero warnings. Final `npm.cmd run build`: PASS, including TypeScript and 120 generated static pages. Raw browser evidence: [FONT_SMOOTHNESS_RESULTS.json](FONT_SMOOTHNESS_RESULTS.json). Credentials/screenshots stay ignored locally.

The rendered-font verification covers English fixture content. It does not certify unsupported non-Latin glyphs, native OS popup menus or browser developer overlays. Inter's Latin subset cannot guarantee every arbitrary script a user might enter.

## Changed files

- `src/app/[locale]/layout.tsx`, `globals.css`, `workspace.css`: font application, inherited controls, synthesis/smoothing, revised scale/tracking, requested text colors and numeric scoping.
- `SubjectCard.tsx`, `LearningInsights.tsx`: secondary date style, stat percentages and numeric scoping.
- `TodayPlan.tsx`, `WeeklyJourney.tsx`, `WorkspaceHeader.tsx`, `WorkspaceShellLoading.tsx`, `src/icons/{command.svg,index.tsx}`: equivalent SVG symbols without font fallback.
- `scripts/font-rendering-audit.mjs`, `scripts/typography-audit.mjs` and `docs/FONT_SMOOTHNESS_*.{md,json}`: actual rendered-font regression coverage and current scale expectations.

No new package, schema, authorization or persistence change was introduced. The development server remains available on port 3000.
