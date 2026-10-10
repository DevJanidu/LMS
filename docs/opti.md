# CRITICAL PRODUCTION BUG FIX — SYSTEM-WIDE CRUD PERSISTENCE, CACHE CONSISTENCY & AUTHENTICATION

You are acting as a Principal Full-Stack Engineer, Database Reliability Engineer, Next.js Architecture Specialist, and Senior QA Automation Engineer.

Our LMS recently underwent a system-wide performance optimization using optimistic UI updates and non-blocking mutations.

The application now feels much faster, but a critical regression has occurred:

**The frontend appears to perform CRUD operations immediately, but the backend, database, and frontend cache are not consistently synchronized.**

This is unacceptable for production.

Your mission is to investigate and permanently fix these issues across the ENTIRE application, not just the modules mentioned below.

## PHASE 1 — REPRODUCE THE ACTUAL BUGS

### Bug A — Created records disappear after refresh

Example: Subjects

1. Open Subjects.
2. Create a new subject.
3. The subject appears immediately.
4. Refresh the page within 100–500 ms.
5. The newly created subject disappears.
6. Refresh again after 2–3 seconds.
7. Sometimes the subject reappears.

The same problem occurs with Library resources and links.

Investigate whether this is caused by:

- Pending mutations interrupted by navigation.
- Server writes not being awaited.
- Stale React Query cache.
- Next.js Data Cache or Full Route Cache.
- Incorrect cache invalidation.
- Server-side rendering using outdated data.
- Replica/read-after-write lag.
- Race conditions.
- Authentication failures.
- API requests failing silently.
- Incorrect temporary-ID reconciliation.
- Optimistic records not being replaced by confirmed database records.

Determine the actual root cause using network traces, server logs, and database verification.

### Bug B — Deleted records reappear after refresh

Example: Subjects, topics, resources.

1. Delete an existing record.
2. The UI removes it immediately.
3. Refresh the page.
4. The deleted record appears again.
5. Sometimes it remains after multiple refreshes.
6. Sometimes it disappears later.

Investigate:

- DELETE requests failing.
- Incorrect HTTP responses.
- Missing authorization.
- Database transaction failures.
- Stale cache responses.
- Incorrect query invalidation.
- Mutation promises not being awaited.
- Conflicting requests.
- Unhandled exceptions.
- Optimistic deletion without server confirmation.
- Incorrect cascade or foreign-key handling.

**Never treat an optimistic deletion as a confirmed database deletion.**

### Bug C — Slow subject navigation

Opening a subject sometimes takes an unusually long time.

Inspect:

- Authentication checks.
- Database queries.
- Subject-detail loading.
- Nested topic loading.
- Server Components.
- Duplicate requests.
- Waterfall fetching.
- Suspense boundaries.
- Unnecessary workspace loading.

### Bug D — Authentication service unavailable

Investigate intermittent authentication errors.

Check:

- Authentication provider availability.
- Session validation.
- Token expiration and refresh.
- Middleware behavior.
- Database connectivity.
- Unauthorized API responses.
- Authentication retries.
- Incorrect caching of user-specific responses.

Never bypass authentication to improve performance.

## PHASE 2 — AUDIT THE ENTIRE APPLICATION

Do not limit your work to Subjects or Library.

Automatically discover every existing page, module, API endpoint, server action, and database mutation.

Include, where applicable:

- Dashboard.
- Subjects and topics.
- Study sessions and study timers.
- Study planner.
- Calendar and recurring schedules.
- Tasks and to-dos.
- Library and resources.
- File uploads.
- Links and attachments.
- Notes.
- Analytics and progress calculations.
- Notifications.
- User profiles and settings.
- Onboarding.
- Authentication.
- Any other existing features.

For each module, identify every operation that modifies persistent state.

Create a complete mutation inventory containing:

- Mutation name.
- UI component.
- API route or server action.
- Database table/model.
- Cache keys affected.
- Related dependent data.
- Authentication requirements.
- Expected server response.
- Error-handling strategy.
- Optimistic update behavior.
- Rollback behavior.

## PHASE 3 — FIX THE MUTATION LIFECYCLE

Implement a reliable mutation lifecycle across the application.

### CREATE

1. Validate the input.
2. Apply an optimistic update where appropriate.
3. Send the request immediately.
4. Ensure the backend awaits the database transaction.
5. Return success only after the write commits.
6. Return the actual persisted record with its permanent database ID.
7. Replace the optimistic record with the server-confirmed record.
8. Update or invalidate all affected cache entries.
9. Reconcile related lists, counters, and detail views.

If the request fails:

- Roll back the optimistic record.
- Preserve the form input where practical.
- Display an actionable error.
- Allow a safe retry.
- Avoid duplicate records.

### UPDATE

1. Optimistically update the UI.
2. Persist changes to the backend.
3. Await transaction completion.
4. Return the authoritative updated record.
5. Reconcile the client cache.
6. Prevent stale responses from overwriting newer changes.

If the update fails, restore the correct state or resolve the conflict.

### DELETE

1. Confirm deletion when necessary.
2. Remove or mark the record optimistically.
3. Execute the DELETE request.
4. Await database commit.
5. Return an accurate success response.
6. Update affected cache entries.
7. Verify dependent records are handled correctly.

If deletion fails:

- Restore the record.
- Show a clear failure message.
- Provide retry functionality.
- Preserve data consistency.

Do not return HTTP 200 merely because the deletion request was received.

The server must confirm the actual result.

## PHASE 4 — FIX NEXT.JS CACHING AND REVALIDATION

Inspect the project's Next.js caching architecture.

Review:

- TanStack Query caching.
- Server Component data fetching.
- Route Handler caching.
- Next.js Data Cache.
- Full Route Cache.
- Router Cache.
- `revalidatePath()`.
- `revalidateTag()`.
- `router.refresh()`.
- Query invalidation.
- Authentication-dependent caching.

Identify every situation where cached data can become inconsistent with the database.

Implement a clear cache ownership strategy.

For frequently changing user-specific CRUD data:

- Prefer authoritative, appropriately uncached server reads where necessary.
- Use targeted client-side cache updates.
- Revalidate affected server data.
- Prevent cross-user cache contamination.
- Ensure list and detail views remain consistent.
- Avoid global workspace refetching unless genuinely necessary.

Do not disable all caching blindly.

Do not add arbitrary timeouts or delays to hide stale-data bugs.

## PHASE 5 — HANDLE IMMEDIATE REFRESH CORRECTLY

This is a mandatory requirement.

Test refreshing the browser:

- Immediately after Create.
- Immediately after Update.
- Immediately after Delete.
- During an in-flight request.
- Immediately after server confirmation.
- After navigating to another page.
- After returning to the original module.

**Required behavior:**

If the server has confirmed a successful mutation, the next authoritative read must reflect that committed change.

If the user refreshes before the server confirms the operation, do not falsely guarantee persistence.

Design an explicit strategy for pending mutations:

- Track pending operations.
- Avoid misleading success messages.
- Clearly distinguish Saving from Saved.
- Handle navigation and refresh safely.
- Use durable client-side mutation persistence only if justified and implemented correctly.
- Reconcile uncertain outcomes using safe operation IDs or idempotency keys.

A successful optimistic UI update is NOT proof of successful database persistence.

## PHASE 6 — FIX AUTHENTICATION AND API RELIABILITY

Trace every affected