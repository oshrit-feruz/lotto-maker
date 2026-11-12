import { Decimal } from 'decimal.js';
import { expandTickets } from '@lotto-maker/shared';
import type { TableInput, TicketType } from '@lotto-maker/shared';

export type PrizeGameKey = 'lotto' | 'double' | 'extra';

/** game -> tier -> prize in ₪ (from the draw's PrizeTier rows). */
export type PrizeTable = Record<PrizeGameKey, Record<string, Decimal>>;

export interface DrawNumbers {
  numbers: number[];
  strong: number;
  extraDigits: number[];
}

export interface OrderToScore {
  ticketType: TicketType;
  systematicType: string | null;
  tables: TableInput[];
  /** The ticket has Extra. */
  extra: boolean;
  /** The 6 digits the terminal printed for this form. */
  extraDigits: number[];
}

export interface WinLine {
  game: PrizeGameKey;
  tier: string;
  /** Winning combinations in this tier. */
  count: number;
  /** Total prize for those combinations. */
  amount: Decimal;
}

/** Lotto prizes start at 3 hits. Returns "5+s", "3", ... or null for no prize. */
export function lottoTier(hits: number, strongHit: boolean): string | null {
  if (hits < 3) return null;
  return strongHit ? `${hits}+s` : `${hits}`;
}

/**
 * Extra: digits are compared position by position; 2 or more matching digits win.
 * Verified on pais.co.il: the published odds (6 digits = 1:7^6) only hold for positional matching.
 */
export function extraTier(ticketDigits: number[], drawDigits: number[]): string | null {
  let matches = 0;
  for (let i = 0; i < drawDigits.length; i++) if (ticketDigits[i] === drawDigits[i]) matches++;
  return matches >= 2 ? String(matches) : null;
}

/**
 * Expands the ticket into plain combinations, matches each against the draw, and prices
 * every hit from the draw's prize table (a double ticket uses the double table).
 * A tier whose prize is 0 pays nothing here, but a ticket that HITS such a tier (an unwon
 * jackpot shows 0 ₪, or the tier is missing) is reported through `onUnpriced` so the caller
 * can hold the order for an admin instead of silently paying 0.
 */
export function scoreOrder(
  order: OrderToScore,
  draw: DrawNumbers,
  prizes: PrizeTable,
  onUnpriced?: (game: PrizeGameKey, tier: string) => void,
): WinLine[] {
  const game: PrizeGameKey = order.ticketType === 'double' ? 'double' : 'lotto';
  const byKey = new Map<string, WinLine>();

  const add = (g: PrizeGameKey, tier: string) => {
    const prize = prizes[g][tier];
    if (!prize || prize.lte(0)) {
      onUnpriced?.(g, tier);
      return;
    }
    const key = `${g}:${tier}`;
    const line = byKey.get(key) ?? { game: g, tier, count: 0, amount: new Decimal(0) };
    line.count += 1;
    line.amount = line.amount.plus(prize);
    byKey.set(key, line);
  };

  const drawSet = new Set(draw.numbers);
  for (const combo of expandTickets(order.tables, order.systematicType)) {
    const hits = combo.numbers.filter((n) => drawSet.has(n)).length;
    const tier = lottoTier(hits, combo.strong === draw.strong);
    if (tier) add(game, tier);
  }

  if (order.extra && order.extraDigits.length > 0) {
    const tier = extraTier(order.extraDigits, draw.extraDigits);
    if (tier) add('extra', tier);
  }

  return [...byKey.values()];
}

export function totalOf(lines: WinLine[]): Decimal {
  return lines.reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
}
