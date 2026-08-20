-- Persist the selected simulated package and the actual payment transition.
CREATE TYPE "PaymentMode" AS ENUM ('simulation', 'manual_qr');

ALTER TABLE "Order" ADD COLUMN "packageId" TEXT;
UPDATE "Order"
SET "packageId" = CASE
  WHEN "packageName" = 'Demo 20 Lesson Package' THEN 'demo-20'
  ELSE 'demo-10'
END;
ALTER TABLE "Order" ALTER COLUMN "packageId" SET NOT NULL;
ALTER TABLE "Order" ADD COLUMN "paymentMode" "PaymentMode" NOT NULL DEFAULT 'simulation';
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);
