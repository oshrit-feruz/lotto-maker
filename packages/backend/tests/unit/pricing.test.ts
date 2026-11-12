import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { computeOrderPrice } from '../../src/lib/pricing.js';

const regular = {
  pricePerTable: new Decimal('3.00'),
  extraPricePerForm: null,
  feePerOrder: new Decimal('2.50'),
};
const double = { ...regular, pricePerTable: new Decimal('6.00') };

const tables = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ numbers: [1, 2, 3, 4, 5, 6 + i], strongNumbers: [1] }));
const sysTable = (n: number) => [
  { numbers: Array.from({ length: n }, (_, i) => i + 1), strongNumbers: [1] },
];

describe('computeOrderPrice', () => {
  it('regular: 3 ₪ per table, form from 6 to 42 ₪ (2-14 tables)', () => {
    expect(computeOrderPrice({ tables: tables(2), systematicType: null, extra: false }, regular).paisPrice).toBe('6.00');
    expect(computeOrderPrice({ tables: tables(14), systematicType: null, extra: false }, regular).paisPrice).toBe('42.00');
  });
  it('double: 6 ₪ per table, form from 12 to 60 ₪ (2-10 tables)', () => {
    expect(computeOrderPrice({ tables: tables(2), systematicType: null, extra: false }, double).paisPrice).toBe('12.00');
    expect(computeOrderPrice({ tables: tables(10), systematicType: null, extra: false }, double).paisPrice).toBe('60.00');
  });
  it('adds our fee on top of the Pais price', () => {
    const p = computeOrderPrice({ tables: tables(4), systematicType: null, extra: false }, regular);
    expect(p).toMatchObject({ paisPrice: '12.00', extraPrice: '0.00', fee: '2.50', total: '14.50' });
  });
  it('systematic price = combinations × table price', () => {
    const p = computeOrderPrice({ tables: sysTable(8), systematicType: 'full_8', extra: false }, regular);
    expect(p.combinations).toBe(28);
    expect(p.paisPrice).toBe('84.00');
    const p12 = computeOrderPrice({ tables: sysTable(12), systematicType: 'full_12', extra: false }, double);
    expect(p12.combinations).toBe(924);
    expect(p12.paisPrice).toBe('5544.00');
  });
  it('refuses Extra while its price is not configured', () => {
    expect(() => computeOrderPrice({ tables: tables(2), systematicType: null, extra: true }, regular)).toThrow(
      /Extra price/,
    );
  });
  it('prices Extra once per form (6 ₪), not per table', () => {
    const row = { ...regular, extraPricePerForm: new Decimal('6.00') };
    const p = computeOrderPrice({ tables: tables(4), systematicType: null, extra: true }, row);
    expect(p.extraPrice).toBe('6.00');
    expect(p.total).toBe('20.50');
    const p2 = computeOrderPrice({ tables: tables(10), systematicType: null, extra: true }, row);
    expect(p2.extraPrice).toBe('6.00');
  });
});
