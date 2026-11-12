-- Extra is priced per form (6 ILS, "הגרלה נלווית"), not per table.
ALTER TABLE "PriceList" RENAME COLUMN "extraPricePerTable" TO "extraPricePerForm";
UPDATE "PriceList" SET "extraPricePerForm" = 6.00 WHERE "extraPricePerForm" IS NULL;

-- Draws where a ticket hit a tier without a prize amount wait for an admin.
ALTER TABLE "Draw" ADD COLUMN "needsAttention" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Draw" ADD COLUMN "attentionReason" TEXT;
