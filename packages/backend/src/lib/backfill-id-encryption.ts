import { prisma } from '../prisma.js';
import { encryptField, hashField, normalizeIsraeliId } from './crypto.js';

/**
 * One-off conversion of ID numbers stored in plain text before encryption was
 * introduced. Runs at startup and does nothing once idNumberLegacy is empty.
 * Legacy IDs were never check-digit validated; they are encrypted as they are.
 */
export async function backfillIdEncryption(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { idNumberLegacy: { not: null } },
    select: { id: true, idNumberLegacy: true },
  });

  let converted = 0;
  for (const user of users) {
    const legacy = user.idNumberLegacy!;
    const id = normalizeIsraeliId(legacy) ?? legacy;
    const data = { idNumberEnc: encryptField(id), idLast4: id.slice(-4), idNumberLegacy: null };
    try {
      await prisma.user.update({ where: { id: user.id }, data: { ...data, idNumberHash: hashField(id) } });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Two legacy accounts share this ID. Still remove the plaintext; leave the
      // hash empty on this one so the unique index holds.
      console.warn(`[backfill] user ${user.id} has an ID number already used by another account`);
      await prisma.user.update({ where: { id: user.id }, data });
    }
    converted++;
  }

  if (converted > 0) console.log(`[backfill] encrypted ${converted} legacy ID number(s)`);
  return converted;
}
