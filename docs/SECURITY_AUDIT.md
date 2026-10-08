# Security audit

## Executed controls

| Control | Evidence | Result |
|---|---|---|
| Private page protection | Unauthenticated `/dashboard` and `/admin` returned 307 | PASS |
| API protection | Unauthenticated `/api/calendar` returned 401; export/files redirect | PASS |
| Role separation | Learner/admin route guards and source tests | PASS |
| Session handling | Login cookie and redirect verified with audit fixture | PASS |
| CORS | Evil-origin requests received no allow-origin header; OPTIONS calendar returned 204 | PASS |
| Storage | Anonymous read 403, signed operations work, tampered upload 403 | PASS |
| Input validation | URL, calendar, auth, upload and rate-limit suites | PASS |
| Cache privacy | Private routes return `private, no-store` | PASS |
| Password handling | Seed/auth tests use Argon2-backed credentials | PASS (source/test evidence) |

No wildcard CORS response, unauthenticated private data response, or storage bypass was observed.

## Assurance gaps

The live ownership integration runner hung against the current acknowledged database, so cross-user database assertions were not independently re-proven in this run. Unit and source-level ownership checks pass, but this remains a release gate until the suite runs on a disposable seeded database. Email provider configuration, production secret rotation, backups and monitoring are operational prerequisites outside this local audit.

