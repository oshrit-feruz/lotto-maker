-- CreateTable
CREATE TABLE "UserLimits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "depositDaily" DECIMAL(12,2),
    "depositWeekly" DECIMAL(12,2),
    "depositMonthly" DECIMAL(12,2),
    "lossMonthly" DECIMAL(12,2),
    "pending" JSONB NOT NULL DEFAULT '{}',
    "selfExcludedUntil" TIMESTAMP(3),
    "selfExcludedPermanent" BOOLEAN NOT NULL DEFAULT false,
    "selfExcludedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserLimits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLimits_userId_key" ON "UserLimits"("userId");
