import { describe, it, expect } from 'vitest';
import {
  validateTicket,
  validateExtraDigits,
  expandTable,
  countCombinations,
  binomial,
  ticketFingerprint,
  SYSTEMATIC_RULES,
  type TicketInput,
} from '@lotto-maker/shared';

const table = (offset = 0) => ({
  numbers: [1, 2, 3, 4, 5, 6 + offset],
  strongNumbers: [1],
});
const tables = (n: number) => Array.from({ length: n }, (_, i) => table(i));

const base = (over: Partial<TicketInput> = {}): TicketInput => ({
  type: 'regular',
  systematicType: null,
  extra: false,
  drawCount: 1,
  tables: tables(2),
  ...over,
});

const codes = (t: TicketInput) => validateTicket(t).map((e) => e.code);

describe('validateTicket – table counts', () => {
  it('accepts every even count 2-14 for regular', () => {
    for (let n = 2; n <= 14; n += 2) expect(codes(base({ tables: tables(n) }))).toEqual([]);
  });
  it('rejects odd counts, 0, 1 and above 14 for regular', () => {
    for (const n of [1, 3, 13]) expect(codes(base({ tables: tables(n) }))).toContain('ODD_TABLE_COUNT');
    expect(codes(base({ tables: [] }))).toContain('INVALID_TABLE_COUNT');
    expect(codes(base({ tables: tables(16) }))).toContain('INVALID_TABLE_COUNT');
  });
  it('accepts even counts 2-10 for double and rejects 12', () => {
    for (let n = 2; n <= 10; n += 2) expect(codes(base({ type: 'double', tables: tables(n) }))).toEqual([]);
    expect(codes(base({ type: 'double', tables: tables(12) }))).toContain('INVALID_TABLE_COUNT');
  });
});

describe('validateTicket – numbers', () => {
  it('rejects out-of-range numbers', () => {
    const t = base({ tables: [{ numbers: [1, 2, 3, 4, 5, 38], strongNumbers: [1] }, table(1)] });
    expect(codes(t)).toContain('NUMBER_OUT_OF_RANGE');
    const zero = base({ tables: [{ numbers: [0, 2, 3, 4, 5, 6], strongNumbers: [1] }, table(1)] });
    expect(codes(zero)).toContain('NUMBER_OUT_OF_RANGE');
  });
  it('rejects non-integers', () => {
    const t = base({ tables: [{ numbers: [1, 2, 3, 4, 5, 6.5], strongNumbers: [1] }, table(1)] });
    expect(codes(t)).toContain('NUMBER_OUT_OF_RANGE');
  });
  it('rejects duplicates', () => {
    const t = base({ tables: [{ numbers: [1, 1, 3, 4, 5, 6], strongNumbers: [1] }, table(1)] });
    expect(codes(t)).toContain('DUPLICATE_NUMBERS');
  });
  it('rejects a wrong count of numbers', () => {
    const t = base({ tables: [{ numbers: [1, 2, 3, 4, 5], strongNumbers: [1] }, table(1)] });
    expect(codes(t)).toContain('INVALID_NUMBER_COUNT');
  });
  it('rejects strong numbers outside 1-7, or more than one on a plain table', () => {
    const high = base({ tables: [{ numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [8] }, table(1)] });
    expect(codes(high)).toContain('NUMBER_OUT_OF_RANGE');
    const two = base({ tables: [{ numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [1, 2] }, table(1)] });
    expect(codes(two)).toContain('INVALID_STRONG_COUNT');
    const none = base({ tables: [{ numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [] }, table(1)] });
    expect(codes(none)).toContain('INVALID_STRONG_COUNT');
  });
});

describe('validateTicket – draws and type', () => {
  it('accepts drawCount 1-10 only', () => {
    for (const d of [1, 5, 10]) expect(codes(base({ drawCount: d }))).toEqual([]);
    for (const d of [0, 11, 1.5]) expect(codes(base({ drawCount: d }))).toContain('INVALID_DRAW_COUNT');
  });
  it('rejects an unknown ticket type', () => {
    expect(codes(base({ type: 'triple' as never }))).toContain('INVALID_TYPE');
  });
});

describe('validateTicket – systematic', () => {
  const sys = (n: number, id: string) =>
    base({
      systematicType: id,
      tables: [{ numbers: Array.from({ length: n }, (_, i) => i + 1), strongNumbers: [3] }],
    });

  it('accepts שיטתי 8-12 with one table of n numbers', () => {
    for (const n of [8, 9, 10, 11, 12]) expect(codes(sys(n, `full_${n}`))).toEqual([]);
  });
  it('rejects a table with the wrong number of numbers for its type', () => {
    expect(codes(sys(9, 'full_8'))).toContain('INVALID_NUMBER_COUNT');
  });
  it('rejects more than one table', () => {
    const t = sys(8, 'full_8');
    t.tables = [...t.tables, ...t.tables];
    expect(codes(t)).toContain('INVALID_TABLE_COUNT');
  });
  it('rejects unknown types and types that are not enabled', () => {
    expect(codes(sys(8, 'nope'))).toContain('UNKNOWN_SYSTEMATIC_TYPE');
    expect(codes(sys(8, 'constructor'))).toContain('UNKNOWN_SYSTEMATIC_TYPE');
    expect(codes(sys(6, 'six_equals_five'))).toContain('SYSTEMATIC_TYPE_DISABLED');
    expect(codes(sys(6, 'strong_4'))).toContain('SYSTEMATIC_TYPE_DISABLED');
  });
  it('keeps every unverified type disabled', () => {
    for (const id of ['six_equals_five', 'strong_4', 'strong_5', 'strong_6', 'strong_7']) {
      expect(SYSTEMATIC_RULES[id]?.enabled).toBe(false);
    }
  });
});

describe('systematic expansion', () => {
  it('שיטתי n expands to C(n,6) distinct combinations', () => {
    for (const n of [8, 9, 10, 11, 12]) {
      const t = { numbers: Array.from({ length: n }, (_, i) => i + 1), strongNumbers: [2] };
      const combos = expandTable(t, `full_${n}`);
      expect(combos).toHaveLength(binomial(n, 6));
      expect(countCombinations(t, `full_${n}`)).toBe(binomial(n, 6));
      expect(new Set(combos.map((c) => c.numbers.join(','))).size).toBe(combos.length);
      expect(combos.every((c) => c.numbers.length === 6 && c.strong === 2)).toBe(true);
    }
  });
  it('binomial gives the known values', () => {
    expect([8, 9, 10, 11, 12].map((n) => binomial(n, 6))).toEqual([28, 84, 210, 462, 924]);
  });
  it('a plain table is one combination', () => {
    expect(expandTable({ numbers: [6, 5, 4, 3, 2, 1], strongNumbers: [7] }, null)).toEqual([
      { numbers: [1, 2, 3, 4, 5, 6], strong: 7 },
    ]);
  });
  it('refuses to expand a type without a verified rule', () => {
    expect(() => expandTable({ numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [1] }, 'six_equals_five')).toThrow();
  });
});

describe('extra digits and fingerprint', () => {
  it('requires 6 digits, each 1-7', () => {
    expect(validateExtraDigits([1, 2, 3, 4, 5, 6])).toBe(true);
    expect(validateExtraDigits([1, 2, 3, 4, 5])).toBe(false);
    expect(validateExtraDigits([1, 2, 3, 4, 5, 8])).toBe(false);
    expect(validateExtraDigits([0, 2, 3, 4, 5, 6])).toBe(false);
  });
  it('fingerprint ignores number and table order', () => {
    const a = ticketFingerprint(
      [
        { numbers: [6, 5, 4, 3, 2, 1], strongNumbers: [1] },
        { numbers: [7, 8, 9, 10, 11, 12], strongNumbers: [2] },
      ],
      null,
    );
    const b = ticketFingerprint(
      [
        { numbers: [7, 8, 9, 10, 11, 12], strongNumbers: [2] },
        { numbers: [1, 2, 3, 4, 5, 6], strongNumbers: [1] },
      ],
      null,
    );
    expect(a).toBe(b);
  });
});
