# Payment timestamp truth fix

> Superseded before release by the migration-history correction. Predicate
> filters cannot identify every fabricated timestamp or preserve every genuine
> one, so migration `20260820040000` has been removed along with
> `20260820030000`. Fresh history leaves historical paid orders at
> `paidAt = NULL`; only new confirmations populate it. This repository had only
> disposable local synthetic data and its demo databases were reset. Any real
> database that applied the old history requires manual review.

Date: 2026-08-20

## Ruling

Historic paid orders created before `2026-08-20 02:00:00` cannot be assigned a
truthful payment time after the earlier migrations. In particular, a genuine
immediate payment (`paidAt = createdAt`) followed by an unrelated update is
indistinguishable from the legacy null-`paidAt` backfill after migration
`20260820030000` copied `updatedAt`. `updatedAt` is therefore not a valid proxy
for payment time.

## Change

Added `server/prisma/migrations/20260820040000_null_ambiguous_historical_paid_at/migration.sql`.
It sets `paidAt` to `NULL` only for paid orders in the bounded ambiguous range:

```sql
"createdAt" < TIMESTAMP '2026-08-20 02:00:00'
AND "updatedAt" > "createdAt"
AND "paidAt" = "updatedAt"
```

This is the exact post-`20260820030000` shape of the legacy/backfill range. It
does not modify orders created at or after the cutoff, so real post-cutoff
payment timestamps remain intact.

Updated `server/test/payment-timestamp-migration.test.js` to execute the two
prior migration states and then the new migration. It verifies all three
outcomes:

- a legacy backfilled timestamp becomes `NULL`;
- the collision case (a real pre-cutoff immediate payment plus a later update)
  becomes `NULL`, because the true value is no longer knowable;
- a post-cutoff real timestamp remains unchanged.

## Red/green evidence

Before the new migration existed:

```text
npm test -- test/payment-timestamp-migration.test.js
✖ final correction marks ambiguous historical paidAt values unknown while preserving post-cutoff timestamps
Error: ENOENT: no such file or directory, open .../20260820040000_null_ambiguous_historical_paid_at/migration.sql
tests 1, pass 0, fail 1
```

After adding the migration:

```text
npm test -- test/payment-timestamp-migration.test.js
✔ final correction marks ambiguous historical paidAt values unknown while preserving post-cutoff timestamps
tests 1, pass 1, fail 0
```

## Full verification

```text
server: npm test
tests 29, pass 29, fail 0

client: npm test --workspace client
Test Files 2 passed (2)
Tests 2 passed (2)

client build: npm run build --workspace client
✓ built in 358ms

E2E: npm run test:e2e
9 passed (5.3s)
```

The E2E web-server command runs `prisma migrate deploy` against its dedicated
database before the browser tests; the suite completed with all nine tests
passing. Prisma emitted its existing `package.json#prisma` deprecation warning,
but no migration or test failure occurred.
