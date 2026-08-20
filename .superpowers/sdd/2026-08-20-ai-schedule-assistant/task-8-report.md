# Task 8 report — end-to-end, accessibility, and release checks

## Delivered

- Added Playwright configuration and `npm run test:e2e`.
- Added browser workflow coverage for individual and same-grade group reservations, conflict and insufficient-credit errors, lesson completion, the simulated-payment flow, and parent-visible data isolation.
- Checked the lesson-details dialog's initial keyboard focus as part of the completion scenario.
- Added the local runbook, demo accounts, and clear synthetic-data/payment disclosure to `README.md`.

## Verification

Could not run the requested server, client, build, or Playwright commands in this execution environment: `node`, `npm`, and `npx` are not installed or available on `PATH`, and no workspace `node_modules` directory exists. The exact initial blocker was: `The term 'node' is not recognized as a name of a cmdlet, function, script file, or executable program.`

Run after installing Node.js and dependencies:

```sh
npm --workspace server test
npm --workspace client test
npm --workspace client run build
npx playwright install chromium
npm run test:e2e
```
