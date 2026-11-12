import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { scoreOrder, totalOf, lottoTier, extraTier } from '../../src/lib/settlement-math.js';
import type { PrizeTable, OrderToScore } from '../../src/lib/settlement-math.js';

const d = (n: number) => new Decimal(n);

// Draw: 4 11 19 23 30 36, strong 5, Extra 3 1 7 2 5 6
const DRAW = { numbers: [4, 11, 19, 23, 30, 36], strong: 5, extraDigits: [3, 1, 7, 2, 5, 6] };

const PRIZES: PrizeTable = {
  lotto: { '6+s': d(1_000_000), '6': d(100_000), '5+s': d(5645), '5': d(245), '4+s': d(85), '4': d(25), '3+s': d(15), '3': d(6) },
  // Double pays twice a regular ticket in every tier
  double: { '6+s': d(2_000_000), '6': d(200_000), '5+s': d(11_290), '5': d(490), '4+s': d(170), '4': d(50), '3+s': d(30), '3': d(12) },
  extra: { '6': d(500_000), '5': d(50_000), '4': d(1000), '3': d(100), '2': d(10) },
};

const order = (over: Partial<OrderToScore> & { numbers?: number[]; strong?: number } = {}): OrderToScore => {
  const { numbers = [1, 2, 3, 4, 5, 6], strong = 1, ...rest } = over;
  return {
    ticketType: 'regular',
    systematicType: null,
    tables: [{ numbers, strongNumbers: [strong] }],
    extra: false,
    extraDigits: [],
    ...rest,
  };
};

describe('lottoTier / extraTier', () => {
  it('lotto prizes start at 3 hits', () => {
    expect(lottoTier(2, true)).toBeNull();
    expect(lottoTier(1, true)).toBeNull();
    expect(lottoTier(3, false)).toBe('3');
    expect(lottoTier(3, true)).toBe('3+s');
  });
  it('extra needs 2 or more matching digits', () => {
    expect(extraTier([3, 2, 2, 2, 2, 2], DRAW.extraDigits)).toBeNull();
    expect(extraTier([3, 1, 2, 2, 2, 2], DRAW.extraDigits)).toBe('2');
  });
});

describe('scoreOrder – plain tables', () => {
  it('2 hits, or 1 hit + strong, win nothing (the old rule paid these)', () => {
    expect(scoreOrder(order({ numbers: [4, 11, 1, 2, 3, 6], strong: 1 }), DRAW, PRIZES)).toEqual([]);
    expect(scoreOrder(order({ numbers: [4, 1, 2, 3, 6, 7], strong: 5 }), DRAW, PRIZES)).toEqual([]);
    expect(scoreOrder(order({ numbers: [4, 11, 1, 2, 3, 6], strong: 5 }), DRAW, PRIZES)).toEqual([]);
  });
  it('3 hits', () => {
    const lines = scoreOrder(order({ numbers: [4, 11, 19, 1, 2, 3], strong: 1 }), DRAW, PRIZES);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ game: 'lotto', tier: '3', count: 1 });
    expect(totalOf(lines).toNumber()).toBe(6);
  });
  it('3 hits + strong', () => {
    const lines = scoreOrder(order({ numbers: [4, 11, 19, 1, 2, 3], strong: 5 }), DRAW, PRIZES);
    expect(lines[0]).toMatchObject({ game: 'lotto', tier: '3+s' });
    expect(totalOf(lines).toNumber()).toBe(15);
  });
  it('5 hits + strong', () => {
    const lines = scoreOrder(order({ numbers: [4, 11, 19, 23, 30, 1], strong: 5 }), DRAW, PRIZES);
    expect(lines[0]).toMatchObject({ tier: '5+s' });
    expect(totalOf(lines).toNumber()).toBe(5645);
  });
  it('double pays 2x a regular ticket for the same table', () => {
    const table = { numbers: [4, 11, 19, 23, 30, 1], strong: 5 };
    const regular = totalOf(scoreOrder(order(table), DRAW, PRIZES));
    const double = totalOf(scoreOrder(order({ ...table, ticketType: 'double' }), DRAW, PRIZES));
    expect(regular.toNumber()).toBe(5645);
    expect(double.toNumber()).toBe(11_290);
    expect(double.toNumber()).toBe(regular.toNumber() * 2);
  });
  it('sums several winning tables of one order, grouped by tier', () => {
    const o = order();
    o.tables = [
      { numbers: [4, 11, 19, 1, 2, 3], strongNumbers: [1] },
      { numbers: [4, 11, 19, 1, 2, 7], strongNumbers: [1] },
      { numbers: [4, 11, 19, 23, 1, 2], strongNumbers: [5] },
    ];
    const lines = scoreOrder(o, DRAW, PRIZES);
    expect(lines.find((l) => l.tier === '3')).toMatchObject({ count: 2 });
    expect(lines.find((l) => l.tier === '4+s')).toMatchObject({ count: 1 });
    expect(totalOf(lines).toNumber()).toBe(6 * 2 + 85);
  });
  it('a tier with prize 0 (nobody won it, not entered) pays nothing', () => {
    const prizes: PrizeTable = { ...PRIZES, lotto: { ...PRIZES.lotto, '3': d(0) } };
    expect(scoreOrder(order({ numbers: [4, 11, 19, 1, 2, 3] }), DRAW, prizes)).toEqual([]);
  });
});

describe('scoreOrder – Extra', () => {
  const withDigits = (digits: number[]) => order({ extra: true, extraDigits: digits });
  const cases: Array<[number, number[], number]> = [
    [2, [3, 1, 1, 1, 1, 1], 10],
    [3, [3, 1, 7, 1, 1, 1], 100],
    [4, [3, 1, 7, 2, 1, 1], 1000],
    [5, [3, 1, 7, 2, 5, 1], 50_000],
    [6, [3, 1, 7, 2, 5, 6], 500_000],
  ];
  it.each(cases)('%i matching digits in order', (n, digits, prize) => {
    const lines = scoreOrder(withDigits(digits), DRAW, PRIZES);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ game: 'extra', tier: String(n) });
    expect(totalOf(lines).toNumber()).toBe(prize);
  });
  it('1 matching digit wins nothing, and Extra off wins nothing', () => {
    expect(scoreOrder(withDigits([3, 2, 2, 1, 1, 1]), DRAW, PRIZES)).toEqual([]);
    expect(scoreOrder(order({ extra: false, extraDigits: [3, 1, 7, 2, 5, 6] }), DRAW, PRIZES)).toEqual([]);
  });
  it('Extra is paid on top of the table prizes', () => {
    const o = withDigits([3, 1, 1, 1, 1, 1]);
    o.tables = [{ numbers: [4, 11, 19, 1, 2, 3], strongNumbers: [1] }];
    expect(totalOf(scoreOrder(o, DRAW, PRIZES)).toNumber()).toBe(6 + 10);
  });
});

describe('scoreOrder – systematic', () => {
  it('שיטתי 8 with all six winners wins on several combinations', () => {
    const o = order();
    o.systematicType = 'full_8';
    o.tables = [{ numbers: [4, 11, 19, 23, 30, 36, 1, 2], strongNumbers: [5] }];
    const lines = scoreOrder(o, DRAW, PRIZES);
    // 28 combinations: 1 x 6+s, 6*2 = 12 x 5+s, C(6,4) = 15 x 4+s
    expect(lines.find((l) => l.tier === '6+s')).toMatchObject({ count: 1 });
    expect(lines.find((l) => l.tier === '5+s')).toMatchObject({ count: 12 });
    expect(lines.find((l) => l.tier === '4+s')).toMatchObject({ count: 15 });
    expect(lines.reduce((n, l) => n + l.count, 0)).toBe(28);
    expect(totalOf(lines).toNumber()).toBe(1_000_000 + 12 * 5645 + 15 * 85);
  });
});
