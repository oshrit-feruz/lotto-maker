import { describe, expect, it } from 'vitest';
import type { TicketInput } from '@lotto-maker/shared';
import { buildPriceDisplay, priceFromList, topUpAmount } from './price';
import { formatShekel } from './format';
import type { CalculateResponse, PricesResponse } from './types';

const calc = (over: Partial<CalculateResponse> = {}): CalculateResponse => ({
  type: 'regular',
  tables: 2,
  combinations: 2,
  drawCount: 1,
  perOrder: { paisPrice: '5.80', extraPrice: '0.00', fee: '3.00', total: '8.80' },
  total: '8.80',
  draws: [{ drawNumber: 3990, drawAt: '2026-11-14T21:00:00.000Z', salesCloseAt: '', orderCutoff: '' }],
  enoughDraws: true,
  ...over,
});

const norm = (s: string) => s.replace(/[‎‏ \s]/g, '');

describe('formatShekel', () => {
  it('formats API strings with two decimals', () => {
    expect(norm(formatShekel('8.8'))).toBe('₪8.80');
    expect(norm(formatShekel(1234.5))).toBe('₪1,234.50');
  });
  it('shows a dash for missing values', () => {
    expect(formatShekel(null)).toBe('—');
    expect(formatShekel('abc')).toBe('—');
  });
});

describe('buildPriceDisplay', () => {
  it('shows form price, fee and total for one draw', () => {
    const d = buildPriceDisplay(calc());
    expect(d.lines.map((l) => l.label)).toEqual(['מחיר הטופס (2 טבלאות)', 'עמלת שירות']);
    expect(norm(d.lines[0]!.value)).toBe('₪5.80');
    expect(norm(d.total)).toBe('₪8.80');
    expect(d.warning).toBeNull();
  });

  it('adds Extra only when it costs something', () => {
    const d = buildPriceDisplay(calc({ perOrder: { paisPrice: '5.80', extraPrice: '3.00', fee: '3.00', total: '11.80' } }));
    expect(d.lines.map((l) => l.label)).toContain('אקסטרה');
  });

  it('shows the per-draw total and multiplier for several draws', () => {
    const d = buildPriceDisplay(calc({ drawCount: 3, total: '26.40' }));
    expect(d.lines.find((l) => l.label === 'מספר הגרלות')!.value).toBe('× 3');
    expect(norm(d.lines.find((l) => l.label === 'סה״כ להגרלה אחת')!.value)).toBe('₪8.80');
    expect(norm(d.total)).toBe('₪26.40');
  });

  it('mentions combinations for a systematic form', () => {
    const d = buildPriceDisplay(calc({ tables: 1, combinations: 28 }));
    expect(d.lines[0]!.label).toBe('מחיר הטופס (1 טבלאות, 28 צירופים)');
  });

  it('warns when not enough draws are announced', () => {
    const d = buildPriceDisplay(calc({ drawCount: 3, enoughDraws: false }));
    expect(d.warning).toContain('1');
  });
});

describe('priceFromList (GET /prices, logged-out calculator)', () => {
  const prices: PricesResponse = {
    currency: 'ILS',
    regular: { pricePerTable: '2.90', extraPricePerForm: '3.00', feePerOrder: '3.00', effectiveFrom: '2026-01-01T00:00:00.000Z' },
    double: { pricePerTable: '5.80', extraPricePerForm: null, feePerOrder: '4.00', effectiveFrom: '2026-01-01T00:00:00.000Z' },
  };
  const tables = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ numbers: [1, 2, 3, 4, 5, 6 + i], strongNumbers: [1] }));
  const input = (over: Partial<TicketInput> = {}): TicketInput => ({
    type: 'regular',
    systematicType: null,
    extra: false,
    drawCount: 1,
    tables: tables(2),
    ...over,
  });

  it('uses the backend formula: tables × price + Extra once + fee, per draw', () => {
    const r = priceFromList(prices, input({ extra: true, drawCount: 3 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.calc.perOrder).toEqual({ paisPrice: '5.80', extraPrice: '3.00', fee: '3.00', total: '11.80' });
    expect(r.calc.total).toBe('35.40');
    expect(norm(buildPriceDisplay(r.calc).total)).toBe('₪35.40');
  });

  it('counts the combinations of a systematic form', () => {
    const r = priceFromList(prices, input({ systematicType: 'full_8', tables: [{ numbers: [1, 2, 3, 4, 5, 6, 7, 8], strongNumbers: [1] }] }));
    if (!r.ok) throw new Error('expected a price');
    expect(r.calc.combinations).toBe(28);
    expect(r.calc.perOrder.paisPrice).toBe('81.20');
  });

  it('uses the double row for a double ticket, and refuses Extra where it has no price', () => {
    const r = priceFromList(prices, input({ type: 'double' }));
    if (!r.ok) throw new Error('expected a price');
    expect(r.calc.perOrder.total).toBe('15.60');
    expect(priceFromList(prices, input({ type: 'double', extra: true }))).toEqual({ ok: false, reason: 'EXTRA_NOT_AVAILABLE' });
  });

  it('reports a missing price row', () => {
    expect(priceFromList({ ...prices, regular: null }, input())).toEqual({ ok: false, reason: 'NO_PRICE' });
  });
});

describe('topUpAmount', () => {
  it('is the missing amount in agorot precision', () => {
    expect(topUpAmount('26.40', '10.00')).toBe(16.4);
    expect(topUpAmount('0.30', '0.10')).toBe(0.2);
  });
  it('is 0 when the wallet covers the total', () => {
    expect(topUpAmount('8.80', '8.80')).toBe(0);
    expect(topUpAmount('8.80', '50')).toBe(0);
  });
});
