-- CreateEnum
CREATE TYPE "KycCheckStatus" AS ENUM ('verified', 'rejected', 'manual_review');

-- CreateTable
CREATE TABLE "KycCheck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "KycCheckStatus" NOT NULL,
    "reason" TEXT,
    "fullName" TEXT NOT NULL,
    "idNumberEnc" TEXT NOT NULL,
    "idNumberHash" TEXT NOT NULL,
    "idLast4" TEXT NOT NULL,
    "birthYear" INTEGER NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KycCheck_status_createdAt_idx" ON "KycCheck"("status", "createdAt");

-- CreateIndex
CREATE INDEX "KycCheck_userId_createdAt_idx" ON "KycCheck"("userId", "createdAt");
