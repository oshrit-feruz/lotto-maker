-- Ticket scans are private: store only the object key, never a public URL.
ALTER TABLE "Order" RENAME COLUMN "ticketScanUrl" TO "ticketScanKey";

-- Existing rows hold "<R2_PUBLIC_URL>/scans/<file>"; keep just the "scans/<file>" key.
UPDATE "Order"
SET "ticketScanKey" = substring("ticketScanKey" from '(scans/[^?#]+)')
WHERE "ticketScanKey" IS NOT NULL;
