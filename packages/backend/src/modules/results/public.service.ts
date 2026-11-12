import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { cutoffsOf, getOpenDraws } from '../../lib/draws.js';

// Public, no-auth data for the website: the next draw, confirmed results and the price list.

/** Display order of the prize tiers, best first. */
export const TIER_ORDER = {
  lotto: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  double: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  extra: ['6', '5', '4', '3', '2'],
} as const;
type PrizeGame = keyof typeof TIER_ORDER;

/** Results are public only once an admin has confirmed them. */
export const PUBLIC_RESULT_STATUSES = ['results_confirmed', 'settled'] as const;

const money = (d: { toFixed(n: number): string } | null | undefined) => (d == null ? null : d.toFixed(2));

/** The next lotto draw still open for orders, or 404 NO_OPEN_DRAW. */
export async function getNextDraw(now: Date = new Date()) {
  const [draw] = await getOpenDraws(1, now);
  if (!draw) throw new AppError(404, 'NO_OPEN_DRAW', 'No lotto draw is open for orders');
  const { hardCutoff, visibleCutoff } = cutoffsOf(draw);
  return {
    id: draw.id,
    gameType: 'lotto' as const,
    drawNumber: draw.drawNumber,
    drawAt: draw.drawAt.toISOString(),
    salesCloseAt: draw.salesCloseAt.toISOString(),
    /** Last moment an order is accepted (salesCloseAt minus our keying buffer). */
    hardCutoff: hardCutoff.toISOString(),
    /** The earlier cutoff to show users. */
    visibleCutoff: visibleCutoff.toISOString(),
    /** Announced first prize in ILS, e.g. "5000000.00"; null if not announced. */
    firstPrize: money(draw.announcedFirstPrize),
    /** Announced double-lotto first prize in ILS; null if not stored. */
    doublePrize: money(draw.announcedDoublePrize),
  };
}

interface DrawWithTiers {
  id: string;
  drawNumber: number;
  drawAt: Date;
  status: string;
  confirmedAt: Date | null;
  numbers: number[];
  strong: number | null;
  extraDigits: number[];
  prizeTiers: Array<{ game: string; tier: string; winnersCount: number; prizeAmount: { toFixed(n: number): string } }>;
}

function rank(game: string, tier: string): number {
  const order = TIER_ORDER[game as PrizeGame] as readonly string[] | undefined;
  const gameRank = Object.keys(TIER_ORDER).indexOf(game);
  return (gameRank < 0 ? 99 : gameRank) * 100 + (order ? order.indexOf(tier) : 99);
}

export function toPublicResult(draw: DrawWithTiers) {
  const prizeTiers = [...draw.prizeTiers]
    .sort((a, b) => rank(a.game, a.tier) - rank(b.game, b.tier))
    .map((t) => ({ game: t.game, tier: t.tier, winnersCount: t.winnersCount, prizeAmount: t.prizeAmount.toFixed(2) }));
  const table = (game: PrizeGame) =>
    prizeTiers.filter((t) => t.game === game).map(({ tier, winnersCount, prizeAmount }) => ({ tier, winnersCount, prizeAmount }));
  return {
    drawId: draw.id,
    gameType: 'lotto' as const,
    drawNumber: draw.drawNumber,
    drawAt: draw.drawAt.toISOString(),
    status: draw.status,
    confirmedAt: draw.confirmedAt ? draw.confirmedAt.toISOString() : null,
    numbers: draw.numbers,
    strong: draw.strong,
    extraDigits: draw.extraDigits,
    /** Flat list of all three tables. */
    prizeTiers,
    /** The same tiers, grouped per table. */
    prizes: { lotto: table('lotto'), double: table('double'), extra: table('extra') },
    // Field names of the older scraper-based /results/:gameType/latest response
    winningNumbers: draw.numbers,
    strongNumber: draw.strong,
    drawDate: draw.drawAt.toISOString(),
  };
}

const withTiers = { prizeTiers: true } as const;

/** The most recent confirmed (or settled) lotto draw, or null. */
export async function findLatestResult() {
  const draw = await prisma.draw.findFirst({
    where: { status: { in: [...PUBLIC_RESULT_STATUSES] } },
    orderBy: { drawAt: 'desc' },
    include: withTiers,
  });
  return draw ? toPublicResult(draw) : null;
}

export async function getLatestResult() {
  const result = await findLatestResult();
  if (!result) throw new AppError(404, 'RESULTS_NOT_AVAILABLE');
  return result;
}

/** One draw's confirmed results; 404 RESULTS_NOT_AVAILABLE while unconfirmed or unknown. */
export async function getResultByDrawNumber(drawNumber: number) {
  const draw = await prisma.draw.findUnique({ where: { drawNumber }, include: withTiers });
  if (!draw || !(PUBLIC_RESULT_STATUSES as readonly string[]).includes(draw.status)) {
    throw new AppError(404, 'RESULTS_NOT_AVAILABLE');
  }
  return toPublicResult(draw);
}

/** The price list in force now, per ticket type. A type with no row is null. */
export async function getActivePrices(now: Date = new Date()) {
  const rowFor = (ticketType: 'regular' | 'double') =>
    prisma.priceList.findFirst({
      where: { ticketType, effectiveFrom: { lte: now } },
      orderBy: { effectiveFrom: 'desc' },
    });
  const [regular, double] = await Promise.all([rowFor('regular'), rowFor('double')]);
  const view = (row: Awaited<ReturnType<typeof rowFor>>) =>
    row && {
      pricePerTable: row.pricePerTable.toFixed(2),
      /** Null: Extra cannot be added to this ticket type. */
      extraPricePerForm: money(row.extraPricePerForm),
      feePerOrder: row.feePerOrder.toFixed(2),
      effectiveFrom: row.effectiveFrom.toISOString(),
    };
  return { currency: 'ILS' as const, regular: view(regular), double: view(double) };
}
