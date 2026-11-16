import { describe, expect, it } from 'vitest';
import { prizeTables, tierLabel } from './results';
import type { PrizeTierView } from './types';

const tier = (game: PrizeTierView['game'], t: string, winnersCount = 1, prizeAmount = '10.00'): PrizeTierView => ({
  game,
  tier: t,
  winnersCount,
  prizeAmount,
});

describe('prizeTables', () => {
  it('groups the flat prizeTiers into lotto, double and Extra tables, in that order', () => {
    const tables = prizeTables({
      prizeTiers: [
        tier('extra', '6', 0, '1000000.00'),
        tier('lotto', '6+s', 0, '5000000.00'),
        tier('double', '6+s', 0, '10000000.00'),
        tier('lotto', '3', 51234, '10.00'),
      ],
    });
    expect(tables.map((t) => [t.game, t.title, t.rows.length])).toEqual([
      ['lotto', 'לוטו', 2],
      ['double', 'דאבל', 1],
      ['extra', 'אקסטרה', 1],
    ]);
    expect(tables[0]!.rows[0]).toEqual({
      tier: '6+s',
      label: '6 + חזק',
      ltr: true,
      winnersCount: 0,
      prizeAmount: '5000000.00',
    });
  });

  it('orders tiers best first even if the response is not sorted', () => {
    const tables = prizeTables({
      prizeTiers: [tier('lotto', '3'), tier('lotto', '6'), tier('lotto', '4+s'), tier('lotto', '6+s'), tier('extra', '2'), tier('extra', '5')],
    });
    expect(tables[0]!.rows.map((r) => r.tier)).toEqual(['6+s', '6', '4+s', '3']);
    expect(tables[1]!.rows.map((r) => r.tier)).toEqual(['5', '2']);
  });

  it('leaves out a table with no tiers, and handles a result without tiers', () => {
    expect(prizeTables({ prizeTiers: [tier('lotto', '6')] }).map((t) => t.game)).toEqual(['lotto']);
    expect(prizeTables({ prizeTiers: [] })).toEqual([]);
    expect(prizeTables({} as never)).toEqual([]);
  });

  it('ignores unknown games', () => {
    expect(prizeTables({ prizeTiers: [{ ...tier('lotto', '6'), game: 'chance' as never }] })).toEqual([]);
  });
});

describe('tierLabel', () => {
  it('labels lotto/double tiers with the strong number, Extra tiers as digits', () => {
    expect(tierLabel('lotto', '5+s')).toEqual({ label: '5 + חזק', ltr: true });
    expect(tierLabel('double', '4')).toEqual({ label: '4', ltr: true });
    expect(tierLabel('extra', '3')).toEqual({ label: '3 ספרות', ltr: false });
  });
});
