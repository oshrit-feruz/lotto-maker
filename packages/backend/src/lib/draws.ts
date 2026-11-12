import { prisma } from '../prisma.js';
import { config } from '../config.js';

const MINUTE = 60_000;
/** The time shown to users is this much earlier than the hard cutoff. */
const VISIBLE_CUTOFF_MARGIN_MINUTES = 15;

/**
 * Cutoffs derive from Draw.salesCloseAt. hardCutoff is the last moment an order is accepted
 * and the queue deadline; visibleCutoff is the earlier time shown to the user.
 */
export function cutoffsOf(draw: { salesCloseAt: Date }) {
  const hardCutoff = new Date(draw.salesCloseAt.getTime() - config.ORDER_CLOSE_BUFFER_MINUTES * MINUTE);
  const visibleCutoff = new Date(hardCutoff.getTime() - VISIBLE_CUTOFF_MARGIN_MINUTES * MINUTE);
  return { hardCutoff, visibleCutoff };
}

/** The next `count` scheduled draws that still accept orders, soonest first. */
export async function getOpenDraws(count: number, from: Date = new Date()) {
  const earliestClose = new Date(from.getTime() + config.ORDER_CLOSE_BUFFER_MINUTES * MINUTE);
  return prisma.draw.findMany({
    where: { status: 'scheduled', salesCloseAt: { gt: earliestClose } },
    orderBy: { drawAt: 'asc' },
    take: count,
  });
}
