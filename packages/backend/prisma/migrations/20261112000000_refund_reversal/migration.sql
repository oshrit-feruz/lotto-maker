-- AlterEnum
ALTER TYPE "WalletTransactionType" ADD VALUE 'refund_reversal';

-- A payment may now have two wallet transactions (the deposit and its
-- reversal), but still only one of each type.
DROP INDEX "WalletTransaction_paymentId_key";
CREATE UNIQUE INDEX "WalletTransaction_paymentId_type_key" ON "WalletTransaction"("paymentId", "type");
