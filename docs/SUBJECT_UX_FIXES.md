# Acadence subjects and compact topics

Validated on 10 October 2026 against the local production build using an existing audit learner account. Only generated audit subjects and their topics were created/deleted; owner records were untouched.

The system name is now **Acadence**, including metadata, auth configuration, account emails, footer text, export filenames and package metadata. The existing logo assets already display Acadence. Translation namespace and internal cache identifiers are retained to preserve compatibility.

Subject cards now expose **Edit subject** and **Delete subject** directly in the subject library. The detail page's existing actions also remain available. Edit forms wait for confirmation before closing, prevent duplicate submission, preserve failed edits for retry, and reset their fields when reopened. Subject deletion keeps its confirmation visible while awaiting commit and displays failed saves instead of dismissing them. A pending optimistic deletion no longer unmounts the detail confirmation dialog.

The baseline browser audit found that detail-page rename and deletion already persisted correctly; the main defects were missing library controls and hidden save failures. The final browser audit verified rename from the library, persisted deletion of the subject and its 50 topics, and successful retries after injected conflict responses for both rename and deletion.

The sustained local server run also exposed uncaught errors from dropped idle Neon pool connections. The pool now handles its `error` event with a fixed, non-sensitive log entry. The driver's existing idle-client removal/replacement stays intact, as does its HTTP read optimization. Query and transaction failures still propagate through normal error handling. This follows the [node-postgres pool error contract](https://node-postgres.com/apis/pool); it does not retry uncertain writes automatically.

Topic rows measured **148px before** and **40px after**, a **73% reduction**. The Topics tab uses one, two or three columns according to available width. In the tested 1440 × 1000 desktop viewport, all 50 rows fit after scrolling to the topic panel. Narrow layouts truncate long names with the full name/status available in the title tooltip; edit, delete, completion and reorder controls remain accessible. Light, dark, RTL and 390px mobile layouts passed horizontal-overflow checks after layout transitions settled.

Validation: production build (including TypeScript), lint, 221 unit tests passed; 12 database integration tests skipped. The pool regression test confirms idle errors are handled without throwing or printing error contents. Browser results are in [SUBJECT_UX_RESULTS.json](SUBJECT_UX_RESULTS.json).

To repeat the browser regression against an already started local production server on port 3100 with the existing ignored fixture file:

```powershell
node scripts/subject-browser-audit.mjs --acknowledge-current-test-database
```

The runner refuses Vercel production execution, requires an audit-prefixed learner, cleans only the generated subject UUID, and retains an ignored ownership record for recovery if interrupted. It injects failed responses in the browser to exercise retry behavior without modifying real learner records. Database mutations themselves remain subject to the existing server ownership and conflict checks.

For this local server, override `APP_URL=http://localhost:3100` and `CACHE_NAMESPACE=test` when starting `npm run start -- --port 3100`. Production retains its HTTPS origin and production cache namespace.
