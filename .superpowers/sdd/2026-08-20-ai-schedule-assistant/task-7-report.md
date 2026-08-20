# Task 7 Report: Teacher and Parent Workspaces

## Completed

- Replaced the placeholder client with Vue teacher and parent workspaces that call the existing REST APIs only.
- Built the teacher-first Operate workbench with the approved paper, ink, course-blue, confirmation-green, conflict-orange, and rule-gray palette.
- Added the weekly time rail and schedule board, visibly dashed AI draft placement, review panel with student balances, student lesson ledger, and lesson action drawer.
- Kept AI parsing non-mutating in the client: `POST /api/teacher/lessons` is called only by the AI preview component's explicit **Confirm reservation** action.
- Added the parent dashboard with account-scoped API data, lesson history, package ordering, and a plainly labeled simulated-payment confirmation.
- Added a local Vite proxy for `/api` and a component test that verifies no `confirm` event exists until the teacher clicks the confirmation button.
- Added no database access, payment secrets, real payment integration, or end-to-end tests.

## Verification

- `git diff --check`: passed.
- Client `package.json` JSON parsing: passed.
- Static source scan: passed; no direct database or payment-secret references exist in `client/src`.
- Attempted `npm --workspace client test` and `npm --workspace client run build`: blocked because this environment has no `node` or `npm` executable on `PATH`.

## Deferred

Install Node.js, run `npm install`, then execute the client component test and production build. Browser-level validation is also deferred because the local client cannot be started without Node.js.

## Follow-up: Schedule visibility and drawer accessibility

- Replaced the fixed January 2031, fixed-hour schedule with a real current-week view, previous/next week controls, and a Today control.
- The time rail is now derived from the displayed API lesson start values and AI preview start value; it preserves minute-precise slots instead of filtering to a preset hour range. Confirming a draft moves the visible week to that lesson's week.
- Extracted the lesson drawer into an accessible modal: it receives initial focus, traps Tab/Shift+Tab, closes on Escape or backdrop dismissal, and restores focus to the lesson trigger.
- Added a focused modal component test for initial focus and Escape behavior.
- Re-ran static validation (`git diff --check` and package JSON parse): passed. Client test/build commands remain blocked because Node.js/npm are unavailable on `PATH`.

## Follow-up: Weekend coverage

- Expanded the weekly board to Monday through Sunday and widened its grid for seven daily columns.
- Updated the lesson and AI-preview range to `[weekStart, weekStart + 7 days)`, so server-valid Saturday and Sunday starts appear in their own date and minute-precise slot.
- A runtime weekend component test could not be run because Node.js/npm are unavailable on `PATH`; the existing test runner remains configured for it once the toolchain is installed.
