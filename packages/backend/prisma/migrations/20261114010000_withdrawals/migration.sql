-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'withdrawal_hold';
ALTER TYPE "WalletTransactionType" ADD VALUE 'withdrawal_release';

-- CreateEnum
CREATE TYPE "WithdrawalMethod" AS ENUM ('card', 'bank');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('requested', 'approved', 'rejected', 'paid', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "WithdrawalMethod" NOT NULL,
    "fee" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'requested',
    "savedCardId" TEXT,
    "bankDetailsEnc" TEXT,
    "bankAccountLast4" TEXT,
    "bankReference" TEXT,
    "providerTxId" TEXT,
    "adminId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_savedCardId_fkey" FOREIGN KEY ("savedCardId") REFERENCES "SavedCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: a wallet transaction can belong to a withdrawal
ALTER TABLE "WalletTransaction" ADD COLUMN "withdrawalId" TEXT;

-- CreateIndex: one hold and at most one release per withdrawal
CREATE UNIQUE INDEX "WalletTransaction_withdrawalId_type_key" ON "WalletTransaction"("withdrawalId", "type");

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
