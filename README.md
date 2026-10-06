# StudyFlow

A personal learning workspace built with the existing Next.js 16, React 19, Tailwind v4 and next-intl template. This delivery is **UI only**: typed mock data and browser state, with no backend, authentication or uploaded file storage.

```sh
npm run dev
npm test
npm run lint
npm run build
```

Open `/dashboard` for the learner workspace and `/admin` for the Super Admin preview. The development sidebar offers a role preview switch. Auth pages simulate flows and never save passwords. All mock account and role controls are for UI preview.

The app name is defined in `src/lib/constants.ts`. Query-shaped mock accessors live in `src/lib/mock/`; pure calculations live in `src/lib/analytics/`; the persistent browser adapter lives in `src/lib/mock/store.ts`. Replace that adapter and the data queries with authorized server actions and Neon/Drizzle queries when building the backend.

English is the complete default copy. Arabic, Spanish and German have matching message keys and translated core navigation; remaining copy currently falls back to English. Arabic uses RTL. Legal pages contain clearly marked drafts pending the owner's launch policies.

`npm test` uses Node's built-in test runner and the installed TypeScript compiler. Browser QA uses the existing local Chrome via DevTools (`scripts/browser-check.mjs`), against a production server on port 3100; no browser/test packages are installed. The browser script currently targets Windows Chrome and writes screenshots under `docs/screenshots`.

See `docs/IMPLEMENTATION.md` for the audit and `docs/DELIVERY.md` for routes, component inventory, assumptions and checks. The original template is preserved in the baseline Git commit. The upstream MIT license remains in `LICENSE`.
