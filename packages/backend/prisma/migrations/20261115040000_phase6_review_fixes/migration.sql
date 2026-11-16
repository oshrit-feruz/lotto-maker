-- At most one KYC check waiting for review per user. Two concurrent submissions could both
-- pass the application's check; this index makes the second insert fail.
-- Any duplicates that already exist keep the oldest pending check and close the rest.
UPDATE "KycCheck" k
SET "status" = 'rejected', "reason" = 'DUPLICATE_PENDING_CHECK', "updatedAt" = CURRENT_TIMESTAMP
WHERE k."status" = 'manual_review'
  AND EXISTS (
    SELECT 1 FROM "KycCheck" o
    WHERE o."userId" = k."userId"
      AND o."status" = 'manual_review'
      AND (o."createdAt", o."id") < (k."createdAt", k."id")
  );

CREATE UNIQUE INDEX "KycCheck_one_pending_per_user" ON "KycCheck"("userId") WHERE "status" = 'manual_review';

-- The issuer details as they stood when each receipt was issued
ALTER TABLE "Receipt" ADD COLUMN "businessName" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "businessAddress" TEXT;
