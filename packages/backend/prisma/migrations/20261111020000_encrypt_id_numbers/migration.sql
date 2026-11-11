-- ID numbers are stored encrypted (idNumberEnc) with a keyed hash for the
-- duplicate check (idNumberHash) and the last 4 digits (idLast4).
ALTER TABLE "User"
  ADD COLUMN "idNumberEnc" TEXT,
  ADD COLUMN "idNumberHash" TEXT,
  ADD COLUMN "idLast4" TEXT,
  ADD COLUMN "birthYear" INTEGER;

-- Keep only the birth year; the full date of birth is dropped.
UPDATE "User" SET "birthYear" = EXTRACT(YEAR FROM "dateOfBirth")::int WHERE "dateOfBirth" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "dateOfBirth";

-- Encryption needs the application key, so SQL cannot convert existing IDs.
-- Park the plaintext in idNumberLegacy; the backend encrypts it and empties
-- this column on its next start (lib/backfill-id-encryption.ts).
UPDATE "User" SET "idLast4" = right(lpad("idNumber", 9, '0'), 4) WHERE "idNumber" IS NOT NULL;
DROP INDEX "User_idNumber_key";
ALTER TABLE "User" RENAME COLUMN "idNumber" TO "idNumberLegacy";

CREATE UNIQUE INDEX "User_idNumberHash_key" ON "User"("idNumberHash");
