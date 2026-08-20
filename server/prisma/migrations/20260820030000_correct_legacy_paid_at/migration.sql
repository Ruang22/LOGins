-- The previous migration backfilled null paidAt values from createdAt for
-- already-paid legacy orders. Payment happened after order creation, so use
-- the preserved transition timestamp for only those records that predate that
-- migration and still have the exact backfill shape.
UPDATE "Order"
SET "paidAt" = "updatedAt"
WHERE "status" = 'paid'
  AND "createdAt" < TIMESTAMP '2026-08-20 02:00:00'
  AND "updatedAt" > "createdAt"
  AND "paidAt" = "createdAt";
