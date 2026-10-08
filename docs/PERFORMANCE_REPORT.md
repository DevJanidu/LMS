# Performance report

Measurements are from the local Next production build on port 3100, Chrome headless, unthrottled desktop, and acknowledged audit fixtures (three subjects with 365 sessions each). They are directional measurements, not a Lighthouse or real-user 4G result.

## Route measurements

The complete values are in `docs/QA_METRICS.json`. Across the warmed learner/admin route checks:

- TTFB was 13–27 ms.
- First contentful paint was 60–96 ms after the initial login navigation.
- No tested route had horizontal overflow.
- Private pages returned `cache-control: private, no-store`.
- Largest observed JavaScript transfer was approximately 502 KB on analytics; calendar was approximately 419 KB.
- Initial login-to-heading was 5,348 ms for the learner fixture and 8,009 ms for the admin fixture.

## Service measurements

`docs/SERVICE_METRICS.json` records three sequential fixture loads: 8,658 ms with 15 queries on the first load, then 2,332 ms and 2,287 ms with 12 queries after warm caches. Settings, analytics and subject caches each show two hits and one miss in that sample.

The first-load timing includes local authentication and database startup effects, so it should not be used as a production SLA. Before release, repeat with production hosting, representative concurrency, network throttling and a realistic data volume.

