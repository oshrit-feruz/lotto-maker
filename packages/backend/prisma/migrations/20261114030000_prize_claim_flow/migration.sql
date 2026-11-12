-- AlterEnum
ALTER TYPE "PrizeClaimStatus" ADD VALUE 'scheduled';
ALTER TYPE "PrizeClaimStatus" ADD VALUE 'expired';

-- AlterTable: expiresAt is added nullable, backfilled, then made required
ALTER TABLE "PrizeClaim"
    ADD COLUMN "scheduledAt" TIMESTAMP(3),
    ADD COLUMN "collectedAt" TIMESTAMP(3),
    ADD COLUMN "collectedByAdminId" TEXT,
    ADD COLUMN "idCheckedLast4" TEXT,
    ADD COLUMN "expiresAt" TIMESTAMP(3),
    ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- Existing claims: draw date + 182 days (the default retention); no draw -> claim creation date.
UPDATE "PrizeClaim" pc
SET "expiresAt" = COALESCE(
    (SELECT d."drawAt" FROM "Order" o JOIN "Draw" d ON d."id" = o."drawId" WHERE o."id" = pc."orderId"),
    pc."createdAt"
) + INTERVAL '182 days';

ALTER TABLE "PrizeClaim" ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "PrizeClaim_status_expiresAt_idx" ON "PrizeClaim"("status", "expiresAt");
