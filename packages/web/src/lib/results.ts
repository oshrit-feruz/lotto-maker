import { PRIZE_TIER_GAME_LABELS } from './labels';
import type { LottoResult, PrizeTierView } from './types';

export type PrizeGame = 'lotto' | 'double' | 'extra';

/** Table order on the page, and tier order inside each table (best first, as the backend sends them). */
export const PRIZE_GAMES: readonly PrizeGame[] = ['lotto', 'double', 'extra'];
const TIER_ORDER: Record<PrizeGame, readonly string[]> = {
  lotto: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  double: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  extra: ['6', '5', '4', '3', '2'],
};

export interface PrizeRow {
  tier: string;
  /** "6 + חזק" for lotto and double; "6 ספרות" for Extra. */
  label: string;
  /** The lotto labels read left to right ("6 + חזק"). */
  ltr: boolean;
  winnersCount: number;
  prizeAmount: string;
}

export interface PrizeTable {
  game: PrizeGame;
  title: string;
  rows: PrizeRow[];
}

export function tierLabel(game: PrizeGame, tier: string): { label: string; ltr: boolean } {
  if (game === 'extra') return { label: /^\d+$/.test(tier) ? `${tier} ספרות` : tier, ltr: false };
  return { label: tier.replace('+s', ' + חזק'), ltr: true };
}

function rank(game: PrizeGame, tier: string): number {
  const i = TIER_ORDER[game].indexOf(tier);
  return i < 0 ? 99 : i;
}

/**
 * The three prize tables (lotto, double, Extra) of a GET /results/latest response.
 * Reads the flat `prizeTiers` list; a table with no tiers is left out.
 */
export function prizeTables(result: Pick<LottoResult, 'prizeTiers'>): PrizeTable[] {
  const tiers: PrizeTierView[] = Array.isArray(result.prizeTiers) ? result.prizeTiers : [];
  return PRIZE_GAMES.map((game) => {
    const rows = tiers
      .filter((t) => t.game === game)
      .sort((a, b) => rank(game, a.tier) - rank(game, b.tier))
      .map((t) => ({ tier: t.tier, ...tierLabel(game, t.tier), winnersCount: t.winnersCount, prizeAmount: t.prizeAmount }));
    return { game, title: PRIZE_TIER_GAME_LABELS[game] ?? game, rows };
  }).filter((t) => t.rows.length > 0);
}
