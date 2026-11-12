import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog } from '../../lib/audit-log.js';
import { notificationService, PAYLOADS } from '../../services/notifications.js';
import { TIMEZONE } from '@lotto-maker/shared';

export type PrizeClaimStatus = 'awaiting_pickup' | 'scheduled' | 'collected' | 'expired';

/** A claim can still be scheduled or collected only in these states. */
const OPEN: PrizeClaimStatus[] = ['awaiting_pickup', 'scheduled'];
const DAY_MS = 24 * 60 * 60 * 1000;
export const REMINDER_DAYS_BEFORE_EXPIRY = 7;

interface ClaimRow {
  id: string;
  orderId: string;
  userId: string;
  amount: { toString(): string };
  status: PrizeClaimStatus;
  scheduledAt: Date | null;
  collectedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

function toView(c: ClaimRow) {
  return {
    id: c.id,
    orderId: c.orderId,
    amount: c.amount.toString(),
    status: c.status,
    scheduledAt: c.scheduledAt,
    collectedAt: c.collectedAt,
    expiresAt: c.expiresAt,
    createdAt: c.createdAt,
  };
}

// ─── User ────────────────────────────────────────────────────────────────────

export async function listUserClaims(userId: string) {
  const rows = await prisma.prizeClaim.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((c: ClaimRow) => toView(c));
}

/** The user asks for a hand-over slot. `awaiting_pickup`/`scheduled` -> `scheduled`. */
export async function scheduleClaimAsUser(userId: string, claimId: string, slot: Date, now = new Date()) {
  return scheduleClaim(claimId, slot, { id: userId, type: 'user' }, now, userId);
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listClaims(status?: PrizeClaimStatus) {
  const rows = await prisma.prizeClaim.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      // Not idLast4: the admin types the digits from the physical ID, they are not shown for copying.
      user: { select: { fullName: true, phone: true } },
      order: { select: { id: true, draw: { select: { drawNumber: true } } } },
    },
  });
  return rows.map((c: ClaimRow & { user: unknown; order: unknown }) => ({ ...toView(c), user: c.user, order: c.order }));
}

export async function scheduleClaimAsAdmin(claimId: string, adminId: string, slot: Date, now = new Date()) {
  return scheduleClaim(claimId, slot, { id: adminId, type: 'admin' }, now);
}

async function scheduleClaim(
  claimId: string,
  slot: Date,
  actor: { id: string; type: 'user' | 'admin' },
  now: Date,
  onlyForUserId?: string,
) {
  const claim = (await prisma.prizeClaim.findUnique({ where: { id: claimId } })) as ClaimRow | null;
  if (!claim || (onlyForUserId && claim.userId !== onlyForUserId)) throw new AppError(404, 'CLAIM_NOT_FOUND');
  if (!OPEN.includes(claim.status)) throw new AppError(409, 'CLAIM_NOT_OPEN', `Claim is ${claim.status}`);
  if (claim.expiresAt <= now) throw new AppError(409, 'CLAIM_EXPIRED');
  if (Number.isNaN(slot.getTime()) || slot <= now || slot > claim.expiresAt) {
    throw new AppError(422, 'INVALID_SLOT', 'The slot must be in the future and before the claim expires');
  }

  const { count } = await prisma.prizeClaim.updateMany({
    where: { id: claimId, status: { in: OPEN } },
    data: { status: 'scheduled', scheduledAt: slot },
  });
  if (count === 0) throw new AppError(409, 'CLAIM_NOT_OPEN');
  await writeAuditLog({
    entityType: 'prize_claim',
    entityId: claimId,
    orderId: claim.orderId,
    action: `prize_claim:${claim.status}->scheduled`,
    actorId: actor.id,
    actorType: actor.type,
    metadata: { scheduledAt: slot.toISOString() },
  });
  return toView((await prisma.prizeClaim.findUnique({ where: { id: claimId } })) as ClaimRow);
}

/**
 * Hand-over of the original ticket. The admin types the last 4 digits of the ID the claimant shows;
 * they must equal User.idLast4. Records who handed the prize over. A wrong ID changes nothing but
 * leaves an audit entry.
 */
export async function collectClaim(claimId: string, adminId: string, idLast4: string, now = new Date()) {
  const claim = (await prisma.prizeClaim.findUnique({
    where: { id: claimId },
    include: { user: { select: { idLast4: true } } },
  })) as (ClaimRow & { user: { idLast4: string | null } }) | null;
  if (!claim) throw new AppError(404, 'CLAIM_NOT_FOUND');
  if (claim.status === 'collected') throw new AppError(409, 'CLAIM_ALREADY_COLLECTED');
  if (claim.status === 'expired' || claim.expiresAt <= now) throw new AppError(409, 'CLAIM_EXPIRED');
  if (!OPEN.includes(claim.status)) throw new AppError(409, 'CLAIM_NOT_OPEN');

  if (!claim.user.idLast4) throw new AppError(422, 'ID_NOT_ON_FILE', 'The claimant has no verified ID');
  if (claim.user.idLast4 !== idLast4) {
    await writeAuditLog({
      entityType: 'prize_claim',
      entityId: claimId,
      orderId: claim.orderId,
      action: 'prize_claim:collect_id_mismatch',
      actorId: adminId,
      actorType: 'admin',
    });
    throw new AppError(422, 'ID_MISMATCH', 'The ID does not match the claimant');
  }

  const { count } = await prisma.prizeClaim.updateMany({
    where: { id: claimId, status: { in: OPEN } },
    data: { status: 'collected', collectedAt: now, collectedByAdminId: adminId, idCheckedLast4: idLast4 },
  });
  if (count === 0) throw new AppError(409, 'CLAIM_NOT_OPEN');
  await writeAuditLog({
    entityType: 'prize_claim',
    entityId: claimId,
    orderId: claim.orderId,
    action: `prize_claim:${claim.status}->collected`,
    actorId: adminId,
    actorType: 'admin',
    metadata: { amount: claim.amount.toString() },
  });
  return toView((await prisma.prizeClaim.findUnique({ where: { id: claimId } })) as ClaimRow);
}

// ─── Daily job ───────────────────────────────────────────────────────────────

/** Marks unclaimed prizes past their retention period `expired`. Nothing is deleted. */
export async function expireClaims(now = new Date()): Promise<number> {
  const due = await prisma.prizeClaim.findMany({
    where: { status: { in: OPEN }, expiresAt: { lte: now } },
    select: { id: true, orderId: true, userId: true, amount: true, status: true },
    take: 500,
  });
  let expired = 0;
  for (const claim of due) {
    const { count } = await prisma.prizeClaim.updateMany({
      where: { id: claim.id, status: { in: OPEN }, expiresAt: { lte: now } },
      data: { status: 'expired' },
    });
    if (count === 0) continue;
    expired++;
    await writeAuditLog({
      entityType: 'prize_claim',
      entityId: claim.id,
      orderId: claim.orderId,
      action: `prize_claim:${claim.status}->expired`,
      actorId: 'system',
      actorType: 'system',
      metadata: { amount: claim.amount.toString(), userId: claim.userId },
    });
  }
  return expired;
}

/** Tells the user, once, that their prize expires within 7 days. */
export async function sendExpiryReminders(now = new Date()): Promise<number> {
  const soon = await prisma.prizeClaim.findMany({
    where: {
      status: { in: OPEN },
      reminderSentAt: null,
      expiresAt: { gt: now, lte: new Date(now.getTime() + REMINDER_DAYS_BEFORE_EXPIRY * DAY_MS) },
    },
    select: { id: true, userId: true, amount: true, expiresAt: true },
    take: 500,
  });
  let sent = 0;
  for (const claim of soon) {
    // Whoever sets reminderSentAt first sends; a second runner finds nothing to claim
    const { count } = await prisma.prizeClaim.updateMany({
      where: { id: claim.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (count === 0) continue;
    sent++;
    const expiresOn = claim.expiresAt.toLocaleDateString('he-IL', { timeZone: TIMEZONE });
    notificationService
      .sendToUser(claim.userId, PAYLOADS.prizeClaimExpiring(claim.amount.toString(), expiresOn))
      .catch(console.error);
  }
  return sent;
}

export async function runPrizeClaimJob(now = new Date()): Promise<{ expired: number; reminded: number }> {
  // Expire first so a claim past its date is not reminded about
  const expired = await expireClaims(now);
  const reminded = await sendExpiryReminders(now);
  return { expired, reminded };
}
