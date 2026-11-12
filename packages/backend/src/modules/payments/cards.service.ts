import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import type { Tx } from '../wallet/wallet.service.js';

/**
 * Remembers the card of an approved payment. Runs in the webhook's transaction.
 * A card the user already has (active or deactivated) is left alone: a card they
 * removed is not silently switched back on.
 */
export async function saveCardTx(
  tx: Tx,
  userId: string,
  card: { token?: string | null; last4?: string | null; brand?: string | null },
): Promise<void> {
  if (!card.token || !card.last4) return;
  const existing = await tx.savedCard.findFirst({ where: { userId, token: card.token } });
  if (existing) return;
  await tx.savedCard.create({
    data: { userId, token: card.token, last4: card.last4, brand: card.brand ?? null },
  });
}

/** The newest active card; null if the user has none. Includes the token: server-side use only. */
export async function getDefaultCard(userId: string) {
  return prisma.savedCard.findFirst({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
  });
}

/** What the client may see: never the token. */
export async function listCards(userId: string) {
  const cards = await prisma.savedCard.findMany({
    where: { userId, active: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, last4: true, brand: true },
  });
  return cards.map((c, i) => ({ id: c.id, last4: c.last4, brand: c.brand, isDefault: i === 0 }));
}

export async function deactivateCard(userId: string, cardId: string): Promise<{ deactivated: true }> {
  const card = await prisma.savedCard.findUnique({ where: { id: cardId } });
  if (!card || card.userId !== userId) throw new AppError(404, 'CARD_NOT_FOUND');
  if (card.active) {
    await prisma.savedCard.update({ where: { id: cardId }, data: { active: false } });
    await writeAuditLog({
      entityType: 'saved_card',
      entityId: cardId,
      action: 'saved_card:deactivated',
      actorId: userId,
      actorType: 'user',
    });
  }
  return { deactivated: true };
}
