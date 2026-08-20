-- The prior two migrations made the following historical values ambiguous:
-- a backfilled paidAt and a real immediate payment followed by any unrelated
-- update are indistinguishable after the corrective migration copied updatedAt.
-- Preserve truthfulness by marking that bounded legacy range as unknown.
UPDATE "Order"
SET "paidAt" = NULL
WHERE "status" = 'paid'
  AND "createdAt" < TIMESTAMP '2026-08-20 02:00:00'
  AND "updatedAt" > "createdAt"
  AND "paidAt" = "updatedAt";
