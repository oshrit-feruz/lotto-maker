import type { PrizeGame, PrizeTier } from '../api/types';

export const GAMES: PrizeGame[] = ['lotto', 'double', 'extra'];
export const GAME_LABEL: Record<PrizeGame, string> = { lotto: 'לוטו', double: 'דאבל לוטו', extra: 'אקסטרה' };
export const TIER_KEYS: Record<PrizeGame, string[]> = {
  lotto: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  double: ['6+s', '6', '5+s', '5', '4+s', '4', '3+s', '3'],
  extra: ['6', '5', '4', '3', '2'],
};

const toAgorot = (v: string | number) => Math.round(Number(v) * 100) || 0;

export interface Payout {
  perGame: Record<PrizeGame, number>;
  total: number;
  winners: number;
}

/**
 * Estimate from the national prize table: sum over tiers of winnersCount × prizeAmount (in agorot
 * to avoid float drift). The winners counts are national, so this is NOT what this system pays;
 * settlement computes actual payouts from customers' tickets.
 */
export function computePayout(tiers: PrizeTier[]): Payout {
  const agorot: Record<PrizeGame, number> = { lotto: 0, double: 0, extra: 0 };
  let winners = 0;
  for (const t of tiers) {
    agorot[t.game] += t.winnersCount * toAgorot(t.prizeAmount);
    winners += t.winnersCount;
  }
  return {
    perGame: { lotto: agorot.lotto / 100, double: agorot.double / 100, extra: agorot.extra / 100 },
    total: (agorot.lotto + agorot.double + agorot.extra) / 100,
    winners,
  };
}
