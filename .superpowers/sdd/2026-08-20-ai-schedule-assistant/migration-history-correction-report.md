# Migration history correction report

Date: 2026-08-20

## Ruling

This application is an unreleased demonstration and every project database
contains only disposable local synthetic data. The migration history was
therefore corrected directly instead of adding another predicate-based forward
fix.

An existing paid order with no recorded payment transition retains
`paidAt = NULL`. `createdAt`, `updatedAt`, order status, and timestamp cutoffs
cannot establish payment provenance and are not used as substitutes. The
payment-detail migration still derives the synthetic package catalog id and
defaults the payment mode to `simulation`. A new simulated-payment confirmation
continues to write its actual confirmation time to `paidAt`.

Cost: if any database containing real data previously applied the superseded
history, it must be preserved and reviewed manually record by record. Its
timestamps must not be bulk-reset or inferred. No such database exists in this
repository's scope.

## History change

Changed:

- `server/prisma/migrations/20260820010000_persist_order_payment_details/migration.sql`
  now documents that historical `paidAt` remains nullable and unknown.
- `server/prisma/migrations/20260820020000_sanitize_legacy_order_package_details/migration.sql`
  still normalizes package facts but no longer assigns `createdAt` to `paidAt`.
- `server/test/payment-timestamp-migration.test.js` now applies the real initial,
  payment-detail, and sanitization SQL in a temporary PostgreSQL schema around a
  paid row inserted before the payment-detail migration. It asserts literal
  migrated values: `packageId = demo-20`, `paymentMode = simulation`, and
  `paidAt = NULL`.

Removed files and their now-empty directories:

- `server/prisma/migrations/20260820030000_correct_legacy_paid_at/migration.sql`
- `server/prisma/migrations/20260820030000_correct_legacy_paid_at/`
- `server/prisma/migrations/20260820040000_null_ambiguous_historical_paid_at/migration.sql`
- `server/prisma/migrations/20260820040000_null_ambiguous_historical_paid_at/`

The obsolete test logic that replayed those two forward corrections was removed
from `server/test/payment-timestamp-migration.test.js`. The two earlier payment
timestamp reports now carry prominent superseded notices. `database/README.md`
and the local SDD progress ledger record the ruling and manual-review cost.

## Test-first evidence

Focused red, before changing the migration:

```text
npm test -- test/payment-timestamp-migration.test.js
✖ migration leaves a pre-existing paid order's unknown payment time null
actual paidAt: 2026-01-10T10:00:00.000Z
expected paidAt: null
tests 1, pass 0, fail 1
```

Focused green, after removing the fabricated backfill:

```text
npm test -- test/payment-timestamp-migration.test.js
✔ migration leaves a pre-existing paid order's unknown payment time null
tests 1, pass 1, fail 0
```

The existing real service regression for new confirmations also passed:

```text
npm test -- test/order-service.test.js
✔ a simulation order adds credits only once
tests 5, pass 5, fail 0
```

That test creates a new pending order, calls `confirmSimulationOrder`, and
asserts both `status = paid` and `paidAt instanceof Date`; removing the
confirmation timestamp write would fail it.

## Local destructive reset scope

The altered migration checksums required realigning only the known Compose demo
databases. Before reset, Docker reported exactly these project resources:

- container `ai-schedule-assistant-db-1` (development plus dedicated test
  database on port 5432);
- container `ai-schedule-assistant-db-e2e-1` (E2E database on port 5433);
- named volume `ai-schedule-assistant_postgres-data`;
- Compose network `ai-schedule-assistant_default`.

`docker compose down --volumes` removed those two containers, that one named
volume, and the project network. It was run twice: the first clean deploy
revealed P3015 because `apply_patch` had removed the superseded SQL files while
their empty directories still existed; after verifying those exact directories
were empty and removing them, the same scoped reset was repeated to prove a
fully clean deployment. No other container, volume, database, path, or external
resource was removed.

The project then recreated both Compose services, recreated only
`schedule_assistant_test`, and deployed the corrected history to development
and test databases. Prisma reported:

```text
3 migrations found in prisma/migrations
Applying migration `20260820000000_initial_schema`
Applying migration `20260820010000_persist_order_payment_details`
Applying migration `20260820020000_sanitize_legacy_order_package_details`
All migrations have been successfully applied.
```

`npm run seed` succeeded. A direct development-database query listed exactly
those three migration names and showed the synthetic seed order as
`pending / simulation / paidAt NULL`.

## Final verification

```text
server: npm test
tests 29, pass 29, fail 0

client: npm test --workspace client
Test Files 2 passed (2)
Tests 2 passed (2)

client build: npm run build --workspace client
13 modules transformed
✓ built in 377ms

E2E: npm run test:e2e
9 passed (5.5s)
```

The E2E stack deployed the corrected migration history to the recreated
dedicated E2E database before running Chromium. Prisma emitted only its existing
`package.json#prisma` deprecation warning; the browser suite had no failures.
