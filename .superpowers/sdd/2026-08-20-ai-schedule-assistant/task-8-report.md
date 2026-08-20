# Task 8 report — end-to-end, accessibility, and release checks

## Fix round 1

### Changed files

- Replaced the `page.route('**/api/**')` mock contracts in `e2e/scheduling.spec.js` and `e2e/orders.spec.js` with browser workflows that use Vite, Express, and PostgreSQL. The only substitute is a deterministic server-side AI provider, so no browser `/api` request is intercepted.
- Added `e2e/fixtures.mjs` and `e2e/start-stack.mjs`. They guard the dedicated `schedule_assistant_e2e` database name, migrate it, reset it to synthetic records, include a foreign synthetic child, and launch Express plus Vite for Playwright.
- Added coverage for individual and same-grade group reservations, real conflict and insufficient-credit rejections, completion, simulated payment with persisted balance, and a foreign-child ID order attempt plus dashboard filtering.
- Added `e2e/release.spec.js` for dialog focus trapping and focus return, accessible landmarks and labels, visible keyboard focus, active-control contrast, and mobile viewport overflow/layout checks.
- Added the disposable `db-e2e` PostgreSQL Compose service on port 5433, E2E environment example, and README instructions describing the real-stack suite and synthetic/simulated data.
- Added the missing Vue Vite plugin so the existing Vue app can build, and fixed the existing health test's missing `node:test` import.

### Commands run

| Command | Result |
| --- | --- |
| `npm install --workspace client --save-dev @vitejs/plugin-vue@^5.2.4` | Passed; 1 package added; audit reported 0 vulnerabilities. |
| `npm --workspace client test` | Passed: 2 files, 2 tests. |
| `npm --workspace client run build` | Passed: Vite built production assets. |
| `DATABASE_URL=...schedule_assistant_e2e npm --workspace server exec prisma validate` | Passed: schema valid. |
| `DATABASE_URL=...schedule_assistant_e2e node --test server/test/health.test.js` | Passed: 1 test. |
| `node --check e2e/*.mjs e2e/*.js` | Passed. |
| `npx playwright test --list` | Passed: discovers 9 Chromium E2E/release checks. |
| `npm --workspace server test` | Not passed: suite requires `server/.env.test` and its dedicated PostgreSQL database; before generation it also exposed an ungenerated Prisma client. |
| `npm run test:e2e` | Not passed: Playwright's real-stack server fails while Prisma migrates the dedicated PostgreSQL database. |

### Exact unrun blocker

Docker Desktop is installed but unavailable in this environment: `docker version` returns `Error response from daemon: Docker Desktop is unable to start`. With `DATABASE_URL=postgresql://schedule_app:change-me-for-local-development@127.0.0.1:5433/schedule_assistant_e2e`, `prisma migrate deploy` reaches the intended datasource and fails with `Error: Schema engine error:` because the dedicated PostgreSQL service cannot be started. Consequently, no PostgreSQL-backed server suite or Playwright browser run is reported as passing. Playwright Chromium also still needs `npx playwright install chromium` before a browser run.
