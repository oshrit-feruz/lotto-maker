-- CreateEnum
CREATE TYPE "ReceiptKind" AS ENUM ('receipt', 'credit');

-- CreateTable
CREATE TABLE "ReceiptCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "ReceiptCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "ReceiptKind" NOT NULL DEFAULT 'receipt',
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalReceiptId" TEXT,
    "customerName" TEXT,
    "idLast4" TEXT,
    "feeAmount" DECIMAL(10,2) NOT NULL,
    "vatRate" DECIMAL(5,4) NOT NULL,
    "vatAmount" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_number_key" ON "Receipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_year_seq_key" ON "Receipt"("year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_orderId_kind_key" ON "Receipt"("orderId", "kind");

-- CreateIndex
CREATE INDEX "Receipt_userId_issuedAt_idx" ON "Receipt"("userId", "issuedAt");
