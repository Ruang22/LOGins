-- Normalize records created before package details became server-authoritative.
-- Unknown package ids are deliberately downgraded to the smallest catalog package.
UPDATE "Order"
SET
  "packageId" = CASE
    WHEN "packageId" = 'demo-20' THEN 'demo-20'
    ELSE 'demo-10'
  END,
  "packageName" = CASE
    WHEN "packageId" = 'demo-20' THEN 'Demo 20 Lesson Package'
    ELSE 'Demo 10 Lesson Package'
  END,
  "creditQuantity" = CASE
    WHEN "packageId" = 'demo-20' THEN 20
    ELSE 10
  END,
  "amountCents" = CASE
    WHEN "packageId" = 'demo-20' THEN 92000
    ELSE 50000
  END,
  "paidAt" = CASE
    WHEN "status" = 'paid' AND "paidAt" IS NULL THEN "createdAt"
    ELSE "paidAt"
  END;
