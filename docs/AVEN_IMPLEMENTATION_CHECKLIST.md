# Aven upgrade progress

Primary specification: `docs/aven.md`. Audit: `docs/AVEN_GAP_ANALYSIS.md`.

- [x] Audit current implementation and distinguish missing capabilities from defects.
- [x] Fix draft preservation, retry semantics, terminal streaming states, cancellation, bounded context, and persistence recovery.
- [x] Complete one-time onboarding and live consent rechecks.
- [x] Extend scoped agent tools and transactional planner/preference/resource operations.
- [x] Implement grouped proactive conversation events, reply context, snooze, active-study suppression, and live preference enforcement.
- [x] Refine chat, notification center, activity states, timestamps, history access, and concise preferences.
- [x] Run unit/security/database tests and genuine provider-backed user journeys.
- [x] Verify production build, migration consistency, delivery configuration, and deployment instructions.

Progress is updated only after implementation and appropriate verification. Runtime AI approvals are product safeguards, not implementation-phase approval requests.

Existing task CRUD, dependencies, completion, linked subjects and study evidence remain supported. Simple goal entry still requires only a title and due date; existing tasks and milestones are preserved when a goal is edited. Testing evidence and deployment requirements are recorded in `AVEN_IMPLEMENTATION_REPORT.md`.
