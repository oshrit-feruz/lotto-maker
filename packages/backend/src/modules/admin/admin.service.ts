import { z } from 'zod';
import {
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  LOTTO_STRONG_MAX,
  validateExtraDigits,
} from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLog, writeAuditLogTx } from '../../lib/audit-log.js';
import { settleDraw } from '../results/settlement.service.js';

const TIER_KEYS = {
  lotto: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  double: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  extra: ['6', '5', '4', '3', '2'],
} as const;

export const editResultsSchema = z.object({
  numbers: z.array(z.number().int().min(1).max(LOTTO_NUMBER_MAX)).length(LOTTO_PICK_COUNT),
  strong: z.number().int().min(1).max(LOTTO_STRONG_MAX),
  extraDigits: z.array(z.number().int().min(1).max(7)).length(6),
  prizeTiers: z
    .array(
      z.object({
        game: z.enum(['lotto', 'double', 'extra']),
        tier: z.string(),
        winnersCount: z.number().int().min(0),
        prizeAmount: z.number().min(0),
      }),
    )
    .min(1),
});
export type EditResultsBody = z.infer<typeof editResultsSchema>;

function assertValidResults(body: EditResultsBody): void {
  if (new Set(body.numbers).size !== body.numbers.length) {
    throw new AppError(400, 'INVALID_RESULTS', 'Numbers must be unique');
  }
  if (!validateExtraDigits(body.extraDigits)) {
    throw new AppError(400, 'INVALID_RESULTS', 'Extra digits must be 6 digits, each 1-7');
  }
  const seen = new Set<string>();
  for (const t of body.prizeTiers) {
    if (!(TIER_KEYS[t.game] as readonly string[]).includes(t.tier)) {
      throw new AppError(400, 'INVALID_RESULTS', `Unknown ${t.game} tier "${t.tier}"`);
    }
    const key = `${t.game}:${t.tier}`;
    if (seen.has(key)) throw new AppError(400, 'INVALID_RESULTS', `Duplicate tier ${key}`);
    seen.add(key);
  }
}

export function listDraws(status?: string) {
  return prisma.draw.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { drawAt: 'desc' },
    take: 50,
    select: {
      id: true,
      drawNumber: true,
      drawAt: true,
      salesCloseAt: true,
      status: true,
      suggestedAt: true,
      confirmedAt: true,
      settledAt: true,
    },
  });
}

export async function getDraw(drawId: string) {
  const draw = await prisma.draw.findUnique({
    where: { id: drawId },
    include: { prizeTiers: { orderBy: [{ game: 'asc' }, { tier: 'desc' }] } },
  });
  if (!draw) throw new AppError(404, 'DRAW_NOT_FOUND');
  return draw;
}

/** Edits the suggested results (or enters them by hand when the scrape failed). Not allowed once confirmed. */
export async function editDrawResults(drawId: string, adminId: string, body: EditResultsBody) {
  assertValidResults(body);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.draw.updateMany({
      where: { id: drawId, status: { in: ['scheduled', 'results_suggested'] } },
      data: {
        numbers: body.numbers,
        strong: body.strong,
        extraDigits: body.extraDigits,
        status: 'results_suggested',
        suggestedAt: new Date(),
      },
    });
    if (count === 0) throw new AppError(409, 'DRAW_NOT_EDITABLE', 'Results can only be edited before confirmation');

    await tx.prizeTier.deleteMany({ where: { drawId } });
    await tx.prizeTier.createMany({
      data: body.prizeTiers.map((t) => ({
        drawId,
        game: t.game,
        tier: t.tier,
        winnersCount: t.winnersCount,
        prizeAmount: t.prizeAmount.toFixed(2),
      })),
    });
    await writeAuditLogTx(tx, {
      entityType: 'draw',
      entityId: drawId,
      action: 'draw:results_edited',
      actorId: adminId,
      actorType: 'admin',
      metadata: { numbers: body.numbers, strong: body.strong, extraDigits: body.extraDigits },
    });
  });

  return getDraw(drawId);
}

/** Confirms the results: `results_suggested` -> `results_confirmed`, recorded with the admin's id. */
export async function confirmDraw(drawId: string, adminId: string) {
  const draw = await getDraw(drawId);
  if (draw.status !== 'results_suggested') {
    throw new AppError(409, 'DRAW_NOT_CONFIRMABLE', `Draw is ${draw.status}, expected results_suggested`);
  }
  const games = new Set(draw.prizeTiers.map((t) => t.game));
  if (draw.numbers.length !== LOTTO_PICK_COUNT || draw.strong === null || !games.has('lotto') || !games.has('double')) {
    throw new AppError(422, 'RESULTS_INCOMPLETE', 'Numbers, strong and the lotto and double prize tables are required');
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.draw.updateMany({
      where: { id: drawId, status: 'results_suggested' },
      data: { status: 'results_confirmed', confirmedAt: new Date(), confirmedById: adminId },
    });
    if (count === 0) throw new AppError(409, 'DRAW_NOT_CONFIRMABLE');
    await writeAuditLogTx(tx, {
      entityType: 'draw',
      entityId: drawId,
      action: 'draw:results_confirmed',
      actorId: adminId,
      actorType: 'admin',
      metadata: { drawNumber: draw.drawNumber },
    });
  });

  // Pay right away; the settlement job would also pick it up within a minute
  void settleDraw(drawId).catch((e) => console.error('[admin] settlement after confirm failed:', e));
  return getDraw(drawId);
}

export function listPrizeClaims(status?: string) {
  return prisma.prizeClaim.findMany({
    where: status ? { status: status as never } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { order: { select: { id: true, draw: { select: { drawNumber: true } } } } },
  });
}

export async function markClaimCollected(claimId: string, adminId: string) {
  const { count } = await prisma.prizeClaim.updateMany({
    where: { id: claimId, status: 'awaiting_pickup' },
    data: { status: 'collected' },
  });
  if (count === 0) throw new AppError(409, 'CLAIM_NOT_AWAITING_PICKUP');
  await writeAuditLog({
    entityType: 'prize_claim',
    entityId: claimId,
    action: 'prize_claim:collected',
    actorId: adminId,
    actorType: 'admin',
  });
  return { collected: true };
}
