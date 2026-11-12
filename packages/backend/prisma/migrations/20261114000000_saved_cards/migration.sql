-- CreateTable
CREATE TABLE "SavedCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "brand" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedCard_userId_token_key" ON "SavedCard"("userId", "token");

-- CreateIndex
CREATE INDEX "SavedCard_userId_active_createdAt_idx" ON "SavedCard"("userId", "active", "createdAt");

-- AddForeignKey
ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cards from payments that were already approved (token known) become saved cards.
INSERT INTO "SavedCard" ("id", "userId", "token", "last4", "createdAt")
SELECT 'bf_' || md5(p."userId" || p."cardToken"), p."userId", p."cardToken", MIN(p."cardLast4"), MIN(p."createdAt")
FROM "Payment" p
WHERE p."status" = 'approved' AND p."cardToken" IS NOT NULL AND p."cardLast4" IS NOT NULL
GROUP BY p."userId", p."cardToken";
