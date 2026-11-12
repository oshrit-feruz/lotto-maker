-- Card credits: the job claims a credit (status 'processing', claimedAt) before calling the
-- provider, so an admin cannot mark it paid by hand while the payout is in flight.
-- The new value is not used anywhere in this migration (it could not be, in the same transaction).
ALTER TYPE "PendingCardCreditStatus" ADD VALUE 'processing';

ALTER TABLE "PendingCardCredit" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- A card credit can also come from a released withdrawal hold that no longer fits under the
-- wallet cap. Exactly one source is set.
ALTER TABLE "PendingCardCredit" ALTER COLUMN "orderId" DROP NOT NULL;
ALTER TABLE "PendingCardCredit" ADD COLUMN "withdrawalId" TEXT;
CREATE UNIQUE INDEX "PendingCardCredit_withdrawalId_key" ON "PendingCardCredit"("withdrawalId");
ALTER TABLE "PendingCardCredit" ADD CONSTRAINT "PendingCardCredit_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PendingCardCredit" ADD CONSTRAINT "PendingCardCredit_one_source" CHECK (num_nonnulls("orderId", "withdrawalId") = 1);

-- The announced prizes exactly as pais sent them (the unit is inferred when parsing)
ALTER TABLE "Draw" ADD COLUMN "announcedFirstPrizeRaw" TEXT;
ALTER TABLE "Draw" ADD COLUMN "announcedDoublePrizeRaw" TEXT;
