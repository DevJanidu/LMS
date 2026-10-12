# Recovering from stale Server Action references

Next.js action IDs belong to a build. An older tab can send an ID missing from the current server manifest after a rebuild or deployment. The reported ID was absent from the local production manifest. This does not identify which remote deployment or browser tab produced the original report.

Client callers now use `runServerAction` for authentication, sign-out, onboarding, account deletion and both upload actions. A known missing-action error opens one shared refresh dialog and is handled by the caller. The dialog lets users review/copy their current inputs before performing a hard reload. Actions are never automatically replayed; ordinary errors and Next.js redirect signals are preserved. Error boundaries also offer a hard refresh for missing-action errors.

`next.config.ts` selects a deployment identifier from `NEXT_DEPLOYMENT_ID`, the Vercel deployment ID or the Vercel deployment URL. Blank values fall through to the next source. For self-hosted releases, supply a unique `NEXT_DEPLOYMENT_ID` consistently at build and start. Next.js uses this value to detect deployment mismatches during navigation. No encryption keys or secrets were generated or changed.

Executed checks: TypeScript, lint, production build, and 32 targeted recovery/auth/upload/translation tests passed. A production-browser test sent the reported unknown action ID to the actual server and confirmed recoverable stale sign-in/sign-out, retained form inputs, one request per submission, hard-refresh recovery, and working fresh sign-in/sign-out with no uncaught browser runtime errors. Fixture credentials and screenshots stay in the ignored `.audit-local/` directory.

References: [Next.js missing-action explanation](https://nextjs.org/docs/messages/failed-to-find-server-action), [deployment identifiers](https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId), and the installed Next.js 16.3.8 Server Actions guide/runtime source.
