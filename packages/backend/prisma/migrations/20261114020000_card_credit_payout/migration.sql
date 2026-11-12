-- AlterEnum ("paid" already exists)
ALTER TYPE "PendingCardCreditStatus" ADD VALUE 'failed';

-- AlterTable
ALTER TABLE "PendingCardCredit"
    ADD COLUMN "providerTxId" TEXT,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "lastError" TEXT,
    ADD COLUMN "paidAt" TIMESTAMP(3),
    ADD COLUMN "paidByAdminId" TEXT,
    ADD COLUMN "manualReference" TEXT;

-- CreateIndex
CREATE INDEX "PendingCardCredit_status_nextAttemptAt_idx" ON "PendingCardCredit"("status", "nextAttemptAt");
