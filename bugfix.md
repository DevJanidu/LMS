You are a senior staff-level Next.js performance engineer.

I have a production-oriented LMS called StudyFlow.

TECH STACK
- Next.js full-stack application
- Next.js App Router
- React
- PostgreSQL hosted on Neon free tier
- Upstash Redis free tier for caching
- No paid infrastructure
- Next.js is used for both frontend and backend

CURRENT PERFORMANCE PROBLEM

Chrome Performance currently reports approximately:

Dashboard:
- LCP: ~7.97 seconds
- CLS: 0
- INP: ~32ms
- LCP element appears to be the dashboard greeting/hero image

Study Planner:
- LCP: ~7.21 seconds
- CLS: 0

Subjects:
- LCP: ~3.01 seconds
- CLS: 0

Analytics:
- LCP: ~3.23 seconds
- CLS: 0
- INP: ~16ms

Library:
- LCP: ~3.16 seconds
- CLS: 0
- INP: ~32ms

The biggest UX problem is that navigation/page rendering appears to wait for
server-side data fetching.

I DO NOT want the whole page blocked while waiting for:
- Neon
- Redis
- authentication
- statistics
- subjects
- study sessions
- calendar data
- resources
- analytics

The application shell should appear immediately.

GOAL

Refactor and optimize the application so it feels like a professional SaaS
application.

Target production performance:
- immediate visual feedback after navigation
- app shell visible almost immediately
- LCP ideally < 2.0s on a normal connection
- Core Web Vitals "good" target: LCP <= 2.5s at p75
- CLS <= 0.1
- INP <= 200ms
- cached/repeated navigation should feel nearly instant
- slow database/API operations must NOT blank/block the whole page

IMPORTANT:
Do not fake performance by hiding content or delaying measurements.
Actually improve the architecture.

==================================================
PHASE 1 — AUDIT BEFORE MODIFYING
==================================================

Do NOT blindly refactor.

First inspect the complete application and determine exactly why these routes
are slow:

/
/subjects
/study
/study-planner
/analytics
/resources

Trace the request/render path for every route.

Investigate:

1. Server Component awaits
2. root layout awaits
3. nested layout awaits
4. authentication/session lookup
5. middleware
6. Neon database queries
7. Upstash Redis calls
8. sequential awaits
9. duplicate queries
10. N+1 queries
11. unnecessary client-side fetching
12. waterfalls
13. large JS bundles
14. unnecessary "use client"
15. dynamic imports
16. images
17. fonts
18. third-party scripts
19. expensive React rendering
20. database connection setup
21. database indexes
22. repeated user/profile queries
23. cache misses
24. cache invalidation strategy
25. loading.tsx boundaries
26. Suspense boundaries
27. route prefetching
28. server actions/API routes
29. fetch cache configuration
30. development-mode overhead

Instrument the important operations using performance timing.

For example, measure:

AUTH          xxx ms
REDIS         xxx ms
DB CONNECT    xxx ms
SUBJECT QUERY xxx ms
STATS QUERY   xxx ms
PAGE RENDER   xxx ms

I want evidence of the bottleneck rather than assumptions.

IMPORTANT:
Performance must be tested using a production build as well:

npm run build
npm run start

Do not judge final performance only using `next dev`.

==================================================
PHASE 2 — REMOVE ROUTE-LEVEL BLOCKING
==================================================

No page should wait for all of its data before rendering its visual structure.

Use the Next.js App Router architecture properly.

Use:
- Server Components by default
- loading.tsx
- React Suspense
- streaming
- nested Suspense boundaries
- skeleton components
- parallel data fetching

Do NOT put one giant Suspense boundary around the entire page.

Split pages into independent sections.

Example:

<Page>
    <PageHeader />

    <Suspense fallback={<StatsSkeleton />}>
        <Stats />
    </Suspense>

    <Suspense fallback={<SubjectsSkeleton />}>
        <Subjects />
    </Suspense>

    <Suspense fallback={<RecentActivitySkeleton />}>
        <RecentActivity />
    </Suspense>
</Page>

The header/layout should not depend on slow page data.

When I navigate to Subjects, I should immediately see:

- global header
- navigation
- "Subjects" heading
- description
- search/filter UI
- subject-card skeletons

Then actual subjects should stream in.

Apply the same principle to:
- Dashboard
- Subjects
- Study
- Study Planner
- Analytics
- Library

==================================================
PHASE 3 — FIX DATA-FETCHING WATERFALLS
==================================================

Search for code like:

const user = await getUser();
const subjects = await getSubjects();
const sessions = await getSessions();
const stats = await getStats();

If operations are independent, execute them concurrently:

const [subjects, sessions, stats] = await Promise.all([...]);

Do not parallelize operations that genuinely depend on one another.

Also detect cases where:

Component A queries user
Component B queries user
Component C queries user

Deduplicate request-scoped work.

Use React cache() where appropriate for request-level memoization.

Avoid hitting Neon multiple times for identical information during one render.

==================================================
PHASE 4 — DATABASE OPTIMIZATION
==================================================

Audit every PostgreSQL query used by these routes.

Check:
- indexes
- WHERE columns
- JOIN columns
- ORDER BY columns
- foreign keys
- user_id
- subject_id
- created_at
- status
- scheduled_at
- study session timestamps

Use EXPLAIN / EXPLAIN ANALYZE where useful.

Find sequential scans on frequently queried tables.

Create appropriate indexes.

Do NOT blindly create indexes everywhere.

Only select fields required by the UI.

Bad:

SELECT *

Better:

SELECT id, name, progress, updated_at ...

Look for N+1 patterns.

Replace loops performing queries with:
- joins
- aggregates
- grouped queries
- batched queries

Dashboard statistics should not require many serial database round trips.

==================================================
PHASE 5 — NEON OPTIMIZATION
==================================================

Review how the application connects to Neon.

Check:
- connection reuse
- pooling
- serverless-compatible connection strategy
- unnecessary new connections
- geographic latency
- cold starts
- connection initialization overhead

Do not open unnecessary PostgreSQL connections per component.

Keep database access server-side.

Account for the limitations/cold behavior of free-tier infrastructure.

==================================================
PHASE 6 — REDIS ARCHITECTURE
==================================================

Audit Upstash Redis usage.

Redis must improve performance, not add another network dependency to every
request.

Do NOT do:

request
→ Redis
→ PostgreSQL
→ Redis
→ render

for every route unless justified.

Determine which LMS data actually benefits from caching.

Good candidates may include:
- dashboard aggregate statistics
- monthly study totals
- weekly analytics
- streak calculations
- expensive aggregate queries
- relatively stable computed data

Frequently changing user data may be better queried directly.

Use sensible TTLs.

Implement invalidation when relevant mutations occur.

Avoid stale incorrect user information.

All cache keys MUST be safely scoped per user/account where necessary.

Never allow data from one user to appear in another user's cache.

==================================================
PHASE 7 — DASHBOARD LCP IMAGE
==================================================

Chrome currently identifies the dashboard greeting/hero image as an LCP
element.

Audit it specifically.

Check:
- file size
- image dimensions
- format
- Next.js Image usage
- priority/preload behavior
- responsive sizes
- lazy loading
- unnecessary client-side selection of image
- whether JavaScript/data fetching determines which image is displayed

If the hero image is above the fold and is the LCP candidate, optimize it
properly.

Use next/image where appropriate.

Do not download a huge desktop image and scale it down in CSS.

Serve appropriate responsive sizes.

Use modern optimized formats where supported.

Do not lazy-load the critical LCP image if doing so delays LCP.

If the greeting changes between morning/afternoon/evening/night, make sure
determining the image does not create a client-side rendering waterfall.

==================================================
PHASE 8 — CLIENT/SERVER COMPONENT AUDIT
==================================================

Search the project for:

"use client"

Identify components that do not actually require client rendering.

Keep client components only where browser state/interactivity is required.

Examples:
- dropdown
- modal
- timer
- interactive calendar
- form controls

Do not make an entire page a Client Component merely because one button needs
state.

Push client boundaries as far down the component tree as possible.

Reduce shipped JavaScript.

==================================================
PHASE 9 — NAVIGATION PERFORMANCE
==================================================

Internal navigation should feel immediate.

Audit all internal navigation.

Use Next.js Link appropriately.

Make sure prefetching is not accidentally disabled without reason.

Do not use:

window.location.href

for normal internal application navigation.

Preserve the shared application layout between routes.

The header/navigation/sidebar should not completely remount during normal
navigation.

==================================================
PHASE 10 — PROFESSIONAL LOADING UX
==================================================

Create reusable skeletons matching the final layout.

Examples:

<DashboardSkeleton />
<SubjectCardSkeleton />
<AnalyticsSkeleton />
<CalendarSkeleton />
<ResourceCardSkeleton />

Skeleton dimensions must closely match final content to prevent CLS.

Do NOT use a full-screen spinner for ordinary page navigation.

Do NOT hide the existing page and display a blank screen.

Expected UX:

click Subjects
→ immediate navigation feedback
→ Subjects shell visible
→ skeleton cards visible
→ actual cards replace skeletons

This should feel like a mature SaaS product.

==================================================
PHASE 11 — STUDY PLANNER
==================================================

The Study Planner currently takes ~7.2 seconds.

The calendar frame itself should render immediately.

Do NOT wait for study events before rendering the calendar.

Render:

calendar shell
→ weekday headings
→ time grid
→ navigation controls

immediately.

Then load scheduled study sessions/events independently and render them into
the calendar.

Changing week/month should not unnecessarily reload the entire application
layout.

Cache/prefetch adjacent periods where sensible without generating excessive
requests.

==================================================
PHASE 12 — ANALYTICS
==================================================

Analytics may contain expensive aggregation.

Do not make every navigation recalculate the complete analytics history.

Investigate:
- precomputed aggregates
- Redis caching
- efficient SQL aggregation
- date-range indexes
- incremental calculations

Render KPI skeletons immediately.

Load independent charts/sections concurrently.

Heavy chart libraries should not unnecessarily block initial rendering.

Dynamically load client-only visualization code where appropriate.

==================================================
PHASE 13 — BUNDLE OPTIMIZATION
==================================================

Inspect the production bundle.

Look for:
- oversized dependencies
- icon packages imported incorrectly
- chart libraries in initial bundle
- unnecessary date libraries
- unused components
- client-side libraries that could remain server-side

Use tree-shakeable imports.

Example:
avoid importing an entire icon package when only several icons are required.

Dynamically import heavy non-critical interactive components where useful.

Do not dynamically import tiny components just for the sake of doing it.

==================================================
PHASE 14 — FONTS / CSS
==================================================

Use next/font where appropriate.

Prevent font-loading delays and layout shifts.

Avoid CSS/JS that blocks initial rendering unnecessarily.

Do not change the existing visual design unless a change is required for
performance.

==================================================
PHASE 15 — AUTHENTICATION
==================================================

Audit authentication carefully.

Determine whether session/auth lookup is unnecessarily repeated:
- middleware
- layout
- page
- API endpoint
- individual components

Do not weaken security to gain performance.

Never cache authorization decisions incorrectly.

Never expose another user's information.

Optimize/deduplicate authentication rather than removing necessary checks.

==================================================
PHASE 16 — ERROR HANDLING
==================================================

Slow or failed Redis/DB requests must not leave an infinite loading screen.

Implement appropriate:
- error.tsx
- timeout/error states
- retry UI where appropriate
- empty states

A failure in a non-critical dashboard widget should not necessarily prevent the
entire dashboard from rendering.

==================================================
PHASE 17 — MEASURE THE RESULT
==================================================

After optimization, test each route again.

Measure:
- TTFB
- FCP
- LCP
- CLS
- INP
- server response time
- database query duration
- Redis duration
- JS bundle size
- navigation behavior

Test:
1. cold navigation
2. warm navigation
3. direct URL load
4. client-side navigation
5. cache hit
6. cache miss
7. slower network simulation

Compare BEFORE vs AFTER.

Produce a table:

Route          Before LCP     After LCP
Dashboard      7.97s          ...
Study Planner  7.21s          ...
Subjects       3.01s          ...
Analytics      3.23s          ...
Library        3.16s          ...

==================================================
IMPORTANT CONSTRAINTS
==================================================

Do NOT:
- remove features
- redesign the application
- weaken authentication
- expose private data
- fake loading metrics
- cache everything blindly
- convert everything to client-side rendering
- add paid infrastructure
- introduce unnecessary dependencies
- replace Neon
- replace Upstash
- change the database unless necessary

Keep:
- Next.js
- Neon PostgreSQL
- Upstash Redis
- current UI/design
- current functionality

The application must remain compatible with free-tier infrastructure.

==================================================
IMPLEMENTATION PROCESS
==================================================

Do this in stages.

STEP 1:
Audit the existing project.

STEP 2:
Give me the actual bottlenecks you found, ranked by impact.

Example:

CRITICAL
1. Root layout waits 2.4s for auth
2. Dashboard executes 7 sequential queries
3. Hero image is 2.8 MB
4. Subjects route waits for data before returning HTML

HIGH
5. Analytics has N+1 query
6. Redis is called unnecessarily

MEDIUM
7. Excessive client components

STEP 3:
Explain the proposed architecture changes.

STEP 4:
Implement the fixes.

STEP 5:
Run type checking, linting and build.

STEP 6:
Run production performance tests.

STEP 7:
Give me the before/after results.

Do not simply tell me recommendations.

Inspect the actual codebase, identify the actual cause, modify the code, and
verify the result.

Performance is the priority, but correctness, security and maintainability must
not be sacrificed.


==================================================
PHASE 18 — PLAYWRIGHT MCP + VISIBLE BROWSER TESTING
==================================================

I want you to perform REAL browser testing after the performance optimizations.

Set up and use Playwright MCP for browser-based testing.

If Playwright MCP is not already installed/configured in this development
environment:

1. Check the existing MCP configuration first.
2. Install the official/current Playwright MCP package.
3. Configure it correctly for this project/development environment.
4. Do not create duplicate MCP configurations if Playwright MCP already exists.
5. Verify that the Playwright MCP server starts successfully.
6. Verify that browser automation is actually available before continuing.

IMPORTANT:

Run Playwright in HEADED / VISIBLE browser mode.

DO NOT run the browser only in headless mode.

I want the browser window to OPEN on my computer while you are testing so I
can visually watch:

- page navigation
- loading behavior
- skeleton rendering
- data appearing
- dashboard rendering
- Subjects rendering
- Study Planner rendering
- Analytics rendering
- Library rendering
- interactions
- errors
- visual problems

If the MCP environment supports a headed-browser option/configuration, enable
it.

If browser binaries are missing, install the required Chromium browser for
Playwright.

Do not install every browser unless necessary. Chromium is sufficient for the
main performance test.

==================================================
START THE APPLICATION CORRECTLY
==================================================

First perform development testing if useful.

Then perform the FINAL performance test using a production build.

Run:

npm run build
npm run start

Make sure the application starts successfully.

Then use Playwright MCP to open:

http://localhost:3000

or the actual local URL/port used by the application.

DO NOT merely send HTTP requests.

Actually open the application in the visible Chromium browser.

==================================================
WATCH THE APPLICATION LIKE A REAL USER
==================================================

Use Playwright MCP to navigate through the application like a real user.

Test this flow:

Dashboard
    ↓
Subjects
    ↓
Study
    ↓
Study Planner
    ↓
Analytics
    ↓
Library
    ↓
Dashboard

Do this using the actual navigation UI.

Do not simply navigate directly to every URL unless testing direct-page loads.

I want to verify that client-side navigation is working properly.

While testing, observe:

- how quickly the shell appears
- how quickly skeletons appear
- how quickly real data appears
- whether navigation freezes
- whether there are blank screens
- whether layouts flash
- whether images appear late
- whether fonts flash
- whether components jump
- whether loading states look professional
- whether data suddenly shifts the layout
- whether buttons become temporarily unresponsive
- whether requests are duplicated
- whether console errors occur

==================================================
TEST THE EXACT PROBLEM I REPORTED
==================================================

The current problem is:

CLICK PAGE
→ WAIT
→ WAIT FOR DATA
→ WHOLE PAGE APPEARS

This is unacceptable.

After optimization I expect:

CLICK PAGE
→ IMMEDIATE RESPONSE
→ PAGE SHELL APPEARS
→ SKELETONS APPEAR
→ DATA STREAMS IN
→ SKELETONS ARE REPLACED
→ NO LAYOUT JUMP

Use Playwright to visually verify this behavior.

Do not consider the optimization complete simply because a Lighthouse number
improved.

The UX must actually FEEL faster.

==================================================
TEST COLD AND WARM NAVIGATION
==================================================

Perform both tests.

TEST A — COLD LOAD

Open a fresh browser/context and directly visit:

/
/subjects
/study
/study-planner
/analytics
/resources

Measure the initial experience.

TEST B — CLIENT NAVIGATION

Start at Dashboard and navigate using the application's UI.

Measure how quickly each route responds.

TEST C — REPEATED NAVIGATION

Navigate:

Dashboard → Subjects → Dashboard → Subjects

and:

Study Planner → Analytics → Study Planner

The second visit should benefit from appropriate Next.js prefetching/caching
where applicable.

==================================================
TEST SLOW NETWORK BEHAVIOR
==================================================

Where supported by the available browser tooling, simulate a slower network.

The application must still provide immediate visual feedback.

I understand actual DATA cannot magically download instantly on a poor
connection.

The requirement is:

USER ACTION
→ IMMEDIATE UI FEEDBACK

even when the network/database is slower.

The user should see a usable shell/skeleton rather than a frozen or blank
application.

==================================================
CHECK BROWSER CONSOLE
==================================================

During Playwright testing, inspect browser console output.

There should be no unexpected:

- React hydration errors
- Next.js errors
- failed requests
- Redis errors
- database errors
- image errors
- preload warnings
- duplicated-key warnings
- unhandled promises
- authentication errors

Fix errors caused by the optimization work.

==================================================
CHECK NETWORK REQUESTS
==================================================

Use the browser tooling/Playwright capabilities available to inspect network
behavior.

Look for:

- duplicate API calls
- duplicate database-backed requests
- unnecessarily large responses
- slow API routes
- sequential requests
- unnecessary refetches
- huge images
- unnecessary JavaScript
- requests repeated during navigation

If something is slow, trace it back to the code responsible.

Do not guess.

==================================================
SCREENSHOTS
==================================================

Take screenshots during testing where useful.

Capture at minimum:

1. Dashboard loaded
2. Subjects loaded
3. Study Planner loaded
4. Analytics loaded
5. Library loaded

Also capture loading/skeleton states if possible.

Use these screenshots to verify there are no visual regressions.

Do not redesign the application.

==================================================
PLAYWRIGHT PERFORMANCE MEASUREMENTS
==================================================

Where possible, collect browser performance information for each major route.

Record:

- navigation timing
- TTFB
- DOMContentLoaded
- load event
- FCP
- LCP
- CLS
- resource timings

Also distinguish between:

SERVER WAIT
NETWORK WAIT
IMAGE LOAD
JS EXECUTION
REACT RENDER
DATA FETCHING

Do not treat all delay as "database latency."

==================================================
DO NOT CHEAT THE PERFORMANCE TEST
==================================================

Do NOT:

- remove real data
- disable authentication
- replace data with hardcoded values
- hide slow components permanently
- remove images merely to improve Lighthouse
- disable functionality
- preload the entire application unnecessarily
- run only warm-cache tests
- report development results as production results

The application must remain fully functional.

==================================================
FINAL VISUAL VERIFICATION
==================================================

After all optimizations are complete:

1. Start the production application.
2. Open a VISIBLE Chromium browser using Playwright MCP.
3. Keep the browser visible.
4. Navigate through the application.
5. Test Dashboard.
6. Test Subjects.
7. Test Study.
8. Test Study Planner.
9. Test Analytics.
10. Test Library.
11. Check console errors.
12. Check network behavior.
13. Verify loading/skeleton states.
14. Verify mobile/responsive behavior where appropriate.
15. Verify no existing functionality was broken.

DO NOT immediately close the visible browser after the final test.

Leave the final tested page/browser open when possible so I can inspect the
result myself.

==================================================
FINAL REPORT
==================================================

After browser testing, give me a concise engineering report:

BEFORE:

Dashboard LCP:      ~7.97s
Study Planner LCP:  ~7.21s
Subjects LCP:       ~3.01s
Analytics LCP:      ~3.23s
Library LCP:        ~3.16s

AFTER:

Dashboard LCP:
Study Planner LCP:
Subjects LCP:
Analytics LCP:
Library LCP:

Also report:

- main bottlenecks discovered
- files changed
- database indexes added
- caching changes
- Suspense/loading boundaries added
- queries optimized
- image optimizations
- bundle optimizations
- authentication optimizations
- errors discovered during Playwright testing
- errors fixed
- remaining performance limitations

Most importantly:

DO NOT claim the application is fast because the code "looks optimized."

Prove it by running the application, opening the visible browser with
Playwright MCP, navigating through the real UI, and measuring the result.