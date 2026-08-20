# LessonlineAI schedule assistant

An AI-assisted tutoring scheduler for reviewing and confirming 60-minute English lesson reservations. The server enforces teacher availability, same-grade groups, and lesson-credit accounting; the browser never changes those records directly.

## Demo accounts and data

- Teacher: `teacher-demo`
- Parent: `parent-demo`

Every displayed name, lesson, balance, package, order, and payment result is **synthetic demonstration data**. The payment flow is simulated and does not accept or reconcile real payments.

## Run locally

1. Copy `.env.example` to `.env`, then start PostgreSQL with `docker compose up -d db`.
2. Install workspace dependencies with `npm install`.
3. Apply the migration and seed the synthetic records:

   ```sh
   npm --workspace server exec prisma migrate deploy
   npm --workspace server run seed
   ```

4. In separate terminals, run `npm run dev:server` and `npm run dev:client`.

The client is served at `http://127.0.0.1:5173` and proxies `/api` requests to the server on port 3000.

## Verification

```sh
npm --workspace server test
npm --workspace client test
npm --workspace client run build
# Start a separate, disposable PostgreSQL service for browser tests.
docker compose up -d db-e2e
npx playwright install chromium
npm run test:e2e
```

The Playwright suite starts Vite and Express, resets only the dedicated `schedule_assistant_e2e` PostgreSQL database, and exercises the browser workflow through the real API. It uses deterministic synthetic fixtures and a server-side AI-provider substitute; it never routes or fulfills browser `/api` requests. Server integration tests separately verify the transactional scheduling, credit, order, and parent-scoping rules against the dedicated test database.
