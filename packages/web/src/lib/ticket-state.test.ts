import { describe, expect, it } from 'vitest';
import { MAX_DRAW_COUNT, SYSTEMATIC_RULES, TICKET_TYPE_LIMITS } from '@lotto-maker/shared';
import {
  clampTableCount,
  completeTicketFrom,
  cryptoRng,
  enabledSystematicRules,
  initialTicketState,
  isTableComplete,
  isTicketComplete,
  pickUnique,
  sanitize,
  tableCountOptions,
  ticketErrors,
  ticketReducer,
  toTicketInput,
  type Rng,
  type TicketAction,
  type TicketState,
} from './ticket-state';

/** Deterministic RNG: a simple LCG. */
function seeded(seed = 42): Rng {
  let s = seed;
  return (max) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % max;
  };
}

const run = (actions: TicketAction[], start: TicketState = initialTicketState()) =>
  actions.reduce(ticketReducer, start);

describe('table counts', () => {
  it('starts with the minimum of 2 tables', () => {
    expect(initialTicketState().tables).toHaveLength(2);
  });

  it('offers only even counts, 2-14 regular and 2-10 double', () => {
    expect(tableCountOptions({ type: 'regular', systematicType: null })).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(tableCountOptions({ type: 'double', systematicType: null })).toEqual([2, 4, 6, 8, 10]);
    expect(TICKET_TYPE_LIMITS.regular.maxTables).toBe(14);
  });

  it('rounds an odd count down to an even one', () => {
    expect(run([{ type: 'setTableCount', count: 5 }]).tables).toHaveLength(4);
    expect(run([{ type: 'setTableCount', count: 1 }]).tables).toHaveLength(2);
  });

  it('caps the count at the type maximum', () => {
    expect(run([{ type: 'setTableCount', count: 20 }]).tables).toHaveLength(14);
    const dbl = run([{ type: 'setType', ticketType: 'double' }, { type: 'setTableCount', count: 14 }]);
    expect(dbl.tables).toHaveLength(10);
  });

  it('switching to double trims 14 tables to 10 and keeps the filled ones', () => {
    const rng = seeded();
    const s = run([
      { type: 'setTableCount', count: 14 },
      { type: 'lottomatAll', rng },
      { type: 'setType', ticketType: 'double' },
    ]);
    expect(s.tables).toHaveLength(10);
    expect(isTicketComplete(s)).toBe(true);
  });

  it('clampTableCount never goes below the minimum', () => {
    expect(clampTableCount({ type: 'regular', systematicType: null }, 0)).toBe(2);
  });
});

describe('number picking', () => {
  it('toggles numbers and keeps them sorted', () => {
    const s = run([
      { type: 'toggleNumber', table: 0, number: 30 },
      { type: 'toggleNumber', table: 0, number: 3 },
      { type: 'toggleNumber', table: 0, number: 17 },
      { type: 'toggleNumber', table: 0, number: 30 },
    ]);
    expect(s.tables[0]!.numbers).toEqual([3, 17]);
  });

  it('stops at 6 numbers per table', () => {
    const s = run([1, 2, 3, 4, 5, 6, 7].map((n) => ({ type: 'toggleNumber', table: 0, number: n }) as TicketAction));
    expect(s.tables[0]!.numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('ignores numbers out of range and unknown tables', () => {
    const s = run([
      { type: 'toggleNumber', table: 0, number: 0 },
      { type: 'toggleNumber', table: 0, number: 38 },
      { type: 'toggleNumber', table: 9, number: 5 },
      { type: 'toggleStrong', table: 0, number: 8 },
    ]);
    expect(s.tables[0]).toEqual({ numbers: [], strongNumbers: [] });
  });

  it('the strong number is a single choice that replaces the previous one', () => {
    const s = run([
      { type: 'toggleStrong', table: 1, number: 3 },
      { type: 'toggleStrong', table: 1, number: 7 },
    ]);
    expect(s.tables[1]!.strongNumbers).toEqual([7]);
  });

  it('a table is complete with 6 numbers and a strong number', () => {
    const s = run([
      ...[5, 10, 15, 20, 25, 30].map((n) => ({ type: 'toggleNumber', table: 0, number: n }) as TicketAction),
      { type: 'toggleStrong', table: 0, number: 2 },
    ]);
    expect(isTableComplete(s, 0)).toBe(true);
    expect(isTableComplete(s, 1)).toBe(false);
    expect(isTicketComplete(s)).toBe(false);
  });

  it('clearTable empties one table only', () => {
    const rng = seeded();
    const s = run([{ type: 'lottomatAll', rng }, { type: 'clearTable', table: 0 }]);
    expect(s.tables[0]).toEqual({ numbers: [], strongNumbers: [] });
    expect(isTableComplete(s, 1)).toBe(true);
  });
});

describe('Lottomat', () => {
  it('pickUnique returns distinct sorted numbers in range', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i++) {
      const nums = pickUnique(6, 37, rng);
      expect(nums).toHaveLength(6);
      expect(new Set(nums).size).toBe(6);
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
      expect(nums.every((n) => n >= 1 && n <= 37)).toBe(true);
    }
  });

  it('fills one table without touching the others', () => {
    const s = run([{ type: 'lottomatTable', table: 1, rng: seeded() }]);
    expect(isTableComplete(s, 1)).toBe(true);
    expect(s.tables[0]).toEqual({ numbers: [], strongNumbers: [] });
  });

  it('fills every table and yields a valid ticket', () => {
    const s = run([{ type: 'setTableCount', count: 14 }, { type: 'lottomatAll', rng: seeded(3) }]);
    expect(isTicketComplete(s)).toBe(true);
    expect(ticketErrors(s)).toEqual([]);
    for (const t of s.tables) {
      expect(t.strongNumbers).toHaveLength(1);
      expect(t.strongNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(t.strongNumbers[0]).toBeLessThanOrEqual(7);
    }
  });

  it('one-click fill with the crypto RNG is valid for every type, table count and systematic rule', () => {
    const shapes: TicketAction[][] = [];
    for (const ticketType of ['regular', 'double'] as const) {
      for (let count = TICKET_TYPE_LIMITS[ticketType].minTables; count <= TICKET_TYPE_LIMITS[ticketType].maxTables; count += 2) {
        shapes.push([{ type: 'setType', ticketType }, { type: 'setTableCount', count }]);
      }
    }
    for (const rule of enabledSystematicRules()) shapes.push([{ type: 'setSystematic', systematicType: rule.id }]);
    for (const shape of shapes) {
      for (let round = 0; round < 20; round++) {
        const s = run([...shape, { type: 'lottomatAll', rng: cryptoRng }]);
        expect(isTicketComplete(s)).toBe(true);
        expect(ticketErrors(s)).toEqual([]);
      }
    }
  });

  it('cryptoRng stays in range', () => {
    for (const max of [1, 7, 37, 1000]) {
      for (let i = 0; i < 200; i++) {
        const v = cryptoRng(max);
        expect(Number.isInteger(v) && v >= 0 && v < max).toBe(true);
      }
    }
  });

  it('lottomatRest fills only the incomplete tables', () => {
    const s0 = run([
      { type: 'setTableCount', count: 4 },
      { type: 'lottomatTable', table: 0, rng: seeded(1) },
      { type: 'toggleNumber', table: 2, number: 5 },
    ]);
    const kept = s0.tables[0];
    const s = ticketReducer(s0, { type: 'lottomatRest', rng: seeded(9) });
    expect(s.tables[0]).toBe(kept);
    expect(isTicketComplete(s)).toBe(true);
    expect(ticketErrors(s)).toEqual([]);
  });

  it('respects the systematic number count', () => {
    const s = run([{ type: 'setSystematic', systematicType: 'full_8' }, { type: 'lottomatAll', rng: seeded() }]);
    expect(s.tables).toHaveLength(1);
    expect(s.tables[0]!.numbers).toHaveLength(8);
    expect(ticketErrors(s)).toEqual([]);
  });
});

describe('systematic types', () => {
  it('lists only enabled rules', () => {
    const ids = enabledSystematicRules().map((r) => r.id);
    for (const id of ids) expect(SYSTEMATIC_RULES[id]!.enabled).toBe(true);
    expect(ids).not.toContain('six_equals_five');
    expect(ids).not.toContain('strong_4');
  });

  it('refuses a disabled or unknown type', () => {
    const start = initialTicketState();
    expect(run([{ type: 'setSystematic', systematicType: 'six_equals_five' }], start)).toBe(start);
    expect(run([{ type: 'setSystematic', systematicType: 'nope' }], start)).toBe(start);
  });

  it('a systematic form has exactly one table and back to plain restores 2', () => {
    const s = run([{ type: 'setSystematic', systematicType: 'full_10' }, { type: 'setTableCount', count: 6 }]);
    expect(s.tables).toHaveLength(1);
    expect(run([{ type: 'setSystematic', systematicType: null }], s).tables).toHaveLength(2);
  });

  it('allows up to the rule number count', () => {
    const s = run([
      { type: 'setSystematic', systematicType: 'full_8' },
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ type: 'toggleNumber', table: 0, number: n }) as TicketAction),
    ]);
    expect(s.tables[0]!.numbers).toHaveLength(8);
  });
});

describe('extra and draw count', () => {
  it('toggles Extra', () => {
    expect(run([{ type: 'setExtra', extra: true }]).extra).toBe(true);
  });

  it('clamps the draw count to 1..MAX_DRAW_COUNT', () => {
    expect(run([{ type: 'setDrawCount', count: 0 }]).drawCount).toBe(1);
    expect(run([{ type: 'setDrawCount', count: 99 }]).drawCount).toBe(MAX_DRAW_COUNT);
    expect(run([{ type: 'setDrawCount', count: 3 }]).drawCount).toBe(3);
  });
});

describe('request body and drafts', () => {
  it('toTicketInput matches the backend ticket body', () => {
    const s = run([{ type: 'lottomatAll', rng: seeded() }, { type: 'setExtra', extra: true }]);
    const input = toTicketInput(s);
    expect(input).toMatchObject({ type: 'regular', systematicType: null, extra: true, drawCount: 1 });
    expect(input.tables).toHaveLength(2);
    expect(Object.keys(input.tables[0]!).sort()).toEqual(['numbers', 'strongNumbers']);
  });

  it('sanitize keeps a valid draft and drops a broken one', () => {
    const s = run([{ type: 'setTableCount', count: 4 }, { type: 'lottomatAll', rng: seeded() }]);
    expect(sanitize(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(sanitize({ ...s, tables: s.tables.slice(0, 3) })).toEqual(initialTicketState());
    expect(sanitize({ ...s, type: 'mega' })).toEqual(initialTicketState());
    expect(sanitize(null)).toEqual(initialTicketState());
  });
});

// Characterization tests pinned before the reducer was split into per-action helpers (#45).
describe('reducer edge cases', () => {
  it('returns the same state object for no-op actions', () => {
    const start = initialTicketState();
    expect(ticketReducer(start, { type: 'setSystematic', systematicType: null })).toBe(start);
    expect(ticketReducer(start, { type: 'toggleNumber', table: 0, number: 0 })).toBe(start);
    expect(ticketReducer(start, { type: 'toggleNumber', table: 0, number: 1.5 })).toBe(start);
    expect(ticketReducer(start, { type: 'toggleStrong', table: 0, number: 8 })).toBe(start);
    expect(ticketReducer(start, { type: 'toggleStrong', table: 5, number: 1 })).toBe(start);
    expect(ticketReducer(start, { type: 'clearTable', table: -1 })).toBe(start);
    expect(ticketReducer(start, { type: 'lottomatTable', table: 2, rng: seeded() })).toBe(start);
    expect(ticketReducer(start, { type: 'setDrawCount', count: Number.NaN })).toBe(start);
    expect(ticketReducer(start, { type: 'unknown' } as unknown as TicketAction)).toBe(start);
  });

  it('keeps the tables array when the count does not change', () => {
    const start = initialTicketState();
    expect(ticketReducer(start, { type: 'setTableCount', count: 2 }).tables).toBe(start.tables);
    expect(ticketReducer(start, { type: 'setType', ticketType: 'double' }).tables).toBe(start.tables);
  });

  it('setType keeps the table count when it fits and pads up to the new minimum', () => {
    const s = run([{ type: 'setTableCount', count: 8 }, { type: 'setType', ticketType: 'double' }]);
    expect(s.type).toBe('double');
    expect(s.tables).toHaveLength(8);
  });

  it('setSystematic empties the tables, also when switching between two rules', () => {
    const rules = enabledSystematicRules().filter((r) => r.kind !== 'unknown');
    expect(rules.length).toBeGreaterThan(1);
    const s = run([
      { type: 'setSystematic', systematicType: rules[0]!.id },
      { type: 'lottomatAll', rng: seeded() },
      { type: 'setSystematic', systematicType: rules[1]!.id },
    ]);
    expect(s.systematicType).toBe(rules[1]!.id);
    expect(s.tables).toEqual([{ numbers: [], strongNumbers: [] }]);
    const dbl = run([{ type: 'setType', ticketType: 'double' }, { type: 'setSystematic', systematicType: rules[0]!.id }]);
    expect(run([{ type: 'setSystematic', systematicType: null }], dbl).tables).toHaveLength(
      TICKET_TYPE_LIMITS.double.minTables,
    );
  });

  it('toggling a picked number removes it; a full table ignores more', () => {
    const s = run([{ type: 'lottomatTable', table: 0, rng: seeded(3) }]);
    const picked = s.tables[0]!.numbers;
    const notPicked = Array.from({ length: 37 }, (_, i) => i + 1).find((n) => !picked.includes(n))!;
    expect(ticketReducer(s, { type: 'toggleNumber', table: 0, number: notPicked })).toEqual(s);
    expect(ticketReducer(s, { type: 'toggleNumber', table: 0, number: picked[0]! }).tables[0]!.numbers).toEqual(
      picked.slice(1),
    );
    const strong = s.tables[0]!.strongNumbers[0]!;
    expect(ticketReducer(s, { type: 'toggleStrong', table: 0, number: strong }).tables[0]!.strongNumbers).toEqual([]);
  });

  it('rounds the draw count', () => {
    expect(run([{ type: 'setDrawCount', count: 2.6 }]).drawCount).toBe(3);
    expect(run([{ type: 'setDrawCount', count: -4 }]).drawCount).toBe(1);
  });

  it('load runs the draft through sanitize', () => {
    const s = run([{ type: 'setTableCount', count: 4 }, { type: 'lottomatAll', rng: seeded() }]);
    expect(run([{ type: 'load', state: JSON.parse(JSON.stringify(s)) }])).toEqual(s);
    expect(run([{ type: 'load', state: { nope: true } as never }], s)).toEqual(initialTicketState());
  });
});

describe('sanitize edge cases', () => {
  const fresh = initialTicketState();

  it('rejects non-objects and missing tables', () => {
    expect(sanitize('x')).toEqual(fresh);
    expect(sanitize(7)).toEqual(fresh);
    expect(sanitize({ type: 'regular' })).toEqual(fresh);
    expect(sanitize({ type: 'regular', tables: 'no' })).toEqual(fresh);
  });

  it('fills defaults and drops non-number entries', () => {
    const out = sanitize({
      type: 'regular',
      tables: [{ numbers: [1, '2', 3], strongNumbers: 'x' }, null],
    });
    expect(out).toEqual({
      type: 'regular',
      systematicType: null,
      extra: false,
      drawCount: 1,
      tables: [
        { numbers: [1, 3], strongNumbers: [] },
        { numbers: [], strongNumbers: [] },
      ],
    });
    expect(sanitize({ type: 'regular', systematicType: 5, extra: 'yes', drawCount: '3', tables: [{}, {}] })).toMatchObject({
      systematicType: null,
      extra: true,
      drawCount: 1,
    });
  });

  it('drops a draft with a disabled systematic type, a bad table count or invalid numbers', () => {
    expect(sanitize({ type: 'regular', systematicType: 'six_equals_five', tables: [{}] })).toEqual(fresh);
    expect(sanitize({ type: 'regular', systematicType: 'nope', tables: [{}] })).toEqual(fresh);
    expect(sanitize({ type: 'double', tables: Array.from({ length: 12 }, () => ({})) })).toEqual(fresh);
    expect(sanitize({ type: 'regular', tables: [{ numbers: [1, 1] }, {}] })).toEqual(fresh);
    expect(sanitize({ type: 'regular', tables: [{ numbers: [40] }, {}] })).toEqual(fresh);
    expect(sanitize({ type: 'regular', drawCount: 99, tables: [{}, {}] })).toEqual(fresh);
  });

  it('keeps a partly filled systematic draft', () => {
    const id = enabledSystematicRules().find((r) => r.kind === 'full')!.id;
    const draft = { type: 'regular', systematicType: id, extra: false, drawCount: 2, tables: [{ numbers: [1, 2], strongNumbers: [] }] };
    expect(sanitize(draft)).toEqual(draft);
  });
});

describe('completeTicketFrom', () => {
  it('returns the sanitized ticket only when every table is filled', () => {
    const s = run([{ type: 'lottomatAll', rng: seeded() }]);
    expect(completeTicketFrom(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(completeTicketFrom(run([{ type: 'lottomatTable', table: 0, rng: seeded() }]))).toBeNull();
    expect(completeTicketFrom(null)).toBeNull();
    expect(completeTicketFrom({ type: 'mega' })).toBeNull();
  });
});
