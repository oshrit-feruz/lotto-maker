import { describe, expect, it } from 'vitest';
import { buildPriceDisplay, topUpAmount } from './price';
import { formatShekel } from './format';
import type { CalculateResponse } from './types';

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
