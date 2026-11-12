import type { TicketType } from '@lotto-maker/shared';
import { prisma } from '../prisma.js';
import { AppError } from '../plugins/error-handler.js';

/** The price row in force at `at`: the latest effectiveFrom not after it. */
export async function getPriceRow(type: TicketType, at: Date = new Date()) {
  const row = await prisma.priceList.findFirst({
    where: { ticketType: type, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!row) throw new AppError(503, 'PRICE_NOT_CONFIGURED', `No price for ${type} lotto`);
  return row;
}
