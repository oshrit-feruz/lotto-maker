-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('regular', 'double');

-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('scheduled', 'results_suggested', 'results_confirmed', 'settled');

-- CreateEnum
CREATE TYPE "PrizeGame" AS ENUM ('lotto', 'double', 'extra');

-- CreateEnum
CREATE TYPE "PrizeClaimStatus" AS ENUM ('awaiting_pickup', 'collected');

-- CreateEnum
CREATE TYPE "PendingCardCreditStatus" AS ENUM ('pending', 'paid');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "drawId" TEXT,
ADD COLUMN     "extraDigits" INTEGER[],
ADD COLUMN     "ticketId" TEXT;

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "systematicType" TEXT,
    "extra" BOOLEAN NOT NULL DEFAULT false,
    "drawCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketTable" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "numbers" INTEGER[],
    "strongNumbers" INTEGER[],

    CONSTRAINT "TicketTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceList" (
    "id" TEXT NOT NULL,
    "ticketType" "TicketType" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "pricePerTable" DECIMAL(8,2) NOT NULL,
    "extraPricePerTable" DECIMAL(8,2),
    "feePerOrder" DECIMAL(8,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draw" (
    "id" TEXT NOT NULL,
    "drawNumber" INTEGER NOT NULL,
    "drawAt" TIMESTAMP(3) NOT NULL,
    "salesCloseAt" TIMESTAMP(3) NOT NULL,
    "numbers" INTEGER[],
    "strong" INTEGER,
    "extraDigits" INTEGER[],
    "status" "DrawStatus" NOT NULL DEFAULT 'scheduled',
    "suggestedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeTier" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "game" "PrizeGame" NOT NULL,
    "tier" TEXT NOT NULL,
    "winnersCount" INTEGER NOT NULL DEFAULT 0,
    "prizeAmount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PrizeTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderWin" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "game" "PrizeGame" NOT NULL,
    "tier" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "OrderWin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeClaim" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PrizeClaimStatus" NOT NULL DEFAULT 'awaiting_pickup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrizeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingCardCredit" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PendingCardCreditStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCardCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ticket_userId_createdAt_idx" ON "Ticket"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TicketTable_ticketId_position_key" ON "TicketTable"("ticketId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PriceList_ticketType_effectiveFrom_key" ON "PriceList"("ticketType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Draw_drawNumber_key" ON "Draw"("drawNumber");

-- CreateIndex
CREATE INDEX "Draw_status_drawAt_idx" ON "Draw"("status", "drawAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeTier_drawId_game_tier_key" ON "PrizeTier"("drawId", "game", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "OrderWin_orderId_game_tier_key" ON "OrderWin"("orderId", "game", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeClaim_orderId_key" ON "PrizeClaim"("orderId");

-- CreateIndex
CREATE INDEX "PrizeClaim_userId_idx" ON "PrizeClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PendingCardCredit_orderId_key" ON "PendingCardCredit"("orderId");

-- CreateIndex
CREATE INDEX "PendingCardCredit_userId_status_idx" ON "PendingCardCredit"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_phone_key" ON "Admin"("phone");

-- CreateIndex
CREATE INDEX "Order_drawId_status_idx" ON "Order"("drawId", "status");

-- CreateIndex
CREATE INDEX "Order_ticketId_idx" ON "Order"("ticketId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTable" ADD CONSTRAINT "TicketTable_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draw" ADD CONSTRAINT "Draw_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeTier" ADD CONSTRAINT "PrizeTier_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderWin" ADD CONSTRAINT "OrderWin_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeClaim" ADD CONSTRAINT "PrizeClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCardCredit" ADD CONSTRAINT "PendingCardCredit_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingCardCredit" ADD CONSTRAINT "PendingCardCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed prices (pais.co.il, checked 2026-11-12). Extra price is not known yet: left NULL,
-- which makes the API refuse Extra. The fee matches the previous fixed service fee.
INSERT INTO "PriceList" ("id", "ticketType", "effectiveFrom", "pricePerTable", "extraPricePerTable", "feePerOrder")
VALUES
  ('pricelist_regular_2026', 'regular', '2026-01-01 00:00:00', 3.00, NULL, 2.50),  ('pricelist_double_2026', 'double', '2026-01-01 00:00:00', 6.00, NULL, 2.50);
