# Payment timestamp fix

> Superseded before release by the migration-history correction. The
> `updatedAt` proxy described below is not trustworthy and migration
> `20260820030000` has been removed. Historical paid orders now retain
> `paidAt = NULL`; only new confirmations populate it. This repository had only
> disposable local synthetic data and its demo databases were reset. Any real
> database that applied the old history requires manual review.

Date: 2026-08-20

## Change

Added `server/prisma/migrations/20260820030000_correct_legacy_paid_at/migration.sql`.
It changes `paidAt` from `createdAt` to `updatedAt` only when all of the following
hold: the order is paid, it predates the legacy migration cutoff
(`2026-08-20 02:00:00`), `updatedAt` is later than `createdAt`, and `paidAt`
exactly matches `createdAt`. Newer orders and their real payment timestamps are
not in scope.

Added `server/test/payment-timestamp-migration.test.js`, which creates a legacy
paid-order fixture and a newer paid order, reproduces the old backfill, runs the
corrective migration SQL, and asserts the legacy row uses `updatedAt` while the
new row retains its real `paidAt`.

## Red/green evidence

Focused check before the migration existed (expected red):

```text
npm test -- test/payment-timestamp-migration.test.js
✖ corrective migration uses updatedAt for legacy paid orders, preserving new paidAt values
Error: ENOENT: no such file or directory, open .../prisma/migrations/20260820030000_correct_legacy_paid_at/migration.sql
tests 1, pass 0, fail 1
```

After adding the migration and applying it to the dedicated test database:

```text
npx prisma migrate deploy
4 migrations found ...
Applying migration `20260820030000_correct_legacy_paid_at`
All migrations have been successfully applied.

npm test -- test/payment-timestamp-migration.test.js
✔ corrective migration uses updatedAt for legacy paid orders, preserving new paidAt values
tests 1, pass 1, fail 0
```

The migration was also deployed to the local development database:

```text
npx prisma migrate deploy
Applying migration `20260820000000_initial_schema`
Applying migration `20260820010000_persist_order_payment_details`
Applying migration `20260820020000_sanitize_legacy_order_package_details`
Applying migration `20260820030000_correct_legacy_paid_at`
All migrations have been successfully applied.
```

## Verification

Server suite:

```text
npm test
tests 29, pass 29, fail 0
```

Client suite:

```text
npm test --workspace client
Test Files 2 passed
Tests 2 passed
```

Client production build:

```text
npm run build --workspace client
✓ built in 361ms
```

End-to-end suite:

```text
npm run test:e2e
9 passed (5.3s)
```
