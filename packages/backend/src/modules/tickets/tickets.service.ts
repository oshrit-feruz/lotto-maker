import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  LOTTO_STRONG_MAX,
  validateTicket,
  ticketFingerprint,
} from '@lotto-maker/shared';
import type { TicketInput, TicketType } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { assertGameEnabled } from '../../lib/games.js';
import { computeOrderPrice } from '../../lib/pricing.js';
import { getPriceRow } from '../../lib/price-row.js';
import { cutoffsOf, getOpenDraws } from '../../lib/draws.js';

export const ticketBodySchema = z.object({
  type: z.enum(['regular', 'double']),
  systematicType: z.string().nullable().default(null),
  extra: z.boolean().default(false),
  drawCount: z.number().int().min(1).max(10).default(1),
  tables: z
    .array(
      z.object({
        numbers: z.array(z.number()).max(12),
        strongNumbers: z.array(z.number()).max(7),
      }),
    )
    .min(1)
    .max(14),
});

export type TicketBody = z.infer<typeof ticketBodySchema>;

/** Throws 400 INVALID_TICKET (with the full error list in `details`) when the ticket breaks a rule. */
export function assertValidTicket(body: TicketInput): void {
  const errors = validateTicket(body);
  if (errors.length > 0) {
    throw new AppError(400, 'INVALID_TICKET', errors[0]!.message, errors);
  }
}

/** Price breakdown, before payment. Nothing is charged or stored. */
export async function calculateTicket(body: TicketBody) {
  assertGameEnabled('lotto');
  assertValidTicket(body);

  const row = await getPriceRow(body.type);
  const perOrder = computeOrderPrice(body, row);
  const draws = await getOpenDraws(body.drawCount);

  const total = (Number(perOrder.total) * body.drawCount).toFixed(2);
  return {
    type: body.type,
    tables: body.tables.length,
    combinations: perOrder.combinations,
    drawCount: body.drawCount,
    /** Price of one order, i.e. one draw. */
    perOrder: { paisPrice: perOrder.paisPrice, extraPrice: perOrder.extraPrice, fee: perOrder.fee, total: perOrder.total },
    /** All draws together. */
    total,
    draws: draws.map((d) => ({
      drawNumber: d.drawNumber,
      drawAt: d.drawAt.toISOString(),
      salesCloseAt: d.salesCloseAt.toISOString(),
      orderCutoff: cutoffsOf(d).hardCutoff.toISOString(),
    })),
    /** False when fewer draws are announced than drawCount; the order would be refused. */
    enoughDraws: draws.length >= body.drawCount,
  };
}

/** Warning, not an error: the user already has this exact combination in one of the draws. */
export async function checkDuplicate(userId: string, body: TicketBody) {
  assertGameEnabled('lotto');
  assertValidTicket(body);

  const draws = await getOpenDraws(body.drawCount);
  if (draws.length === 0) return { duplicate: false, drawNumbers: [] as number[] };

  const existing = await prisma.order.findMany({
    where: {
      userId,
      drawId: { in: draws.map((d) => d.id) },
      ticketId: { not: null },
      status: { notIn: ['cancelled', 'refunded'] },
    },
    select: {
      draw: { select: { drawNumber: true } },
      ticket: {
        select: {
          systematicType: true,
          tables: { select: { numbers: true, strongNumbers: true } },
        },
      },
    },
  });

  const mine = ticketFingerprint(body.tables, body.systematicType);
  const drawNumbers = new Set<number>();
  for (const o of existing) {
    if (!o.ticket || !o.draw) continue;
    if (ticketFingerprint(o.ticket.tables, o.ticket.systematicType) === mine) {
      drawNumbers.add(o.draw.drawNumber);
    }
  }
  return { duplicate: drawNumbers.size > 0, drawNumbers: [...drawNumbers].sort((a, b) => a - b) };
}

function randomUniqueNumbers(count: number, max: number): number[] {
  const picked = new Set<number>();
  while (picked.size < count) picked.add(randomInt(1, max + 1));
  return [...picked].sort((a, b) => a - b);
}

/** Lottomat: random plain tables, generated on the server. */
export function generateLottomatTables(type: TicketType, tableCount: number) {
  const tables = Array.from({ length: tableCount }, () => ({
    numbers: randomUniqueNumbers(LOTTO_PICK_COUNT, LOTTO_NUMBER_MAX),
    strongNumbers: [randomInt(1, LOTTO_STRONG_MAX + 1)],
  }));
  assertValidTicket({ type, systematicType: null, extra: false, drawCount: 1, tables });
  return tables;
}
