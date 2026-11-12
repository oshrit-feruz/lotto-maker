-- Announced prizes of an upcoming draw (getNextLotteryDate firstPrize / secondPrize), in ILS
ALTER TABLE "Draw" ADD COLUMN "announcedFirstPrize" DECIMAL(14,2),
ADD COLUMN "announcedDoublePrize" DECIMAL(14,2);

-- POST /orders Idempotency-Key, unique per user (NULLs do not collide)
ALTER TABLE "Ticket" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Ticket_userId_idempotencyKey_key" ON "Ticket"("userId", "idempotencyKey");

-- GET /admin/audit filters on an action prefix, newest first
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
