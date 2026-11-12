// Ticket form state: a pure reducer so the rules (even table counts, limits,
// Lottomat) can be unit tested without a browser. Every limit comes from
// @lotto-maker/shared; the backend validates the same ticket again.
import {
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  LOTTO_STRONG_MAX,
  MAX_DRAW_COUNT,
  SYSTEMATIC_RULES,
  TICKET_TYPE_LIMITS,
  getSystematicRule,
  validateTicket,
  type SystematicRule,
  type TicketInput,
  type TicketType,
  type TicketValidationError,
} from '@lotto-maker/shared';

export interface TableState {
  numbers: number[];
  strongNumbers: number[];
}

export interface TicketState {
  type: TicketType;
  /** Key into SYSTEMATIC_RULES, or null for plain tables. */
  systematicType: string | null;
  extra: boolean;
  drawCount: number;
  tables: TableState[];
}

/** Random integer in [0, maxExclusive). Injected so tests are deterministic. */
export type Rng = (maxExclusive: number) => number;

export type TicketAction =
  | { type: 'setType'; ticketType: TicketType }
  | { type: 'setTableCount'; count: number }
  | { type: 'setSystematic'; systematicType: string | null }
  | { type: 'toggleNumber'; table: number; number: number }
  | { type: 'toggleStrong'; table: number; number: number }
  | { type: 'clearTable'; table: number }
  | { type: 'lottomatTable'; table: number; rng: Rng }
  | { type: 'lottomatAll'; rng: Rng }
  | { type: 'setExtra'; extra: boolean }
  | { type: 'setDrawCount'; count: number }
  | { type: 'load'; state: TicketState };

const emptyTable = (): TableState => ({ numbers: [], strongNumbers: [] });
const byValue = (a: number, b: number) => a - b;

export function initialTicketState(): TicketState {
  return {
    type: 'regular',
    systematicType: null,
    extra: false,
    drawCount: 1,
    tables: Array.from({ length: TICKET_TYPE_LIMITS.regular.minTables }, emptyTable),
  };
}

/** Systematic types shown in the form: only those the shared rules mark enabled. */
export function enabledSystematicRules(): SystematicRule[] {
  return Object.values(SYSTEMATIC_RULES).filter((r) => r.enabled && r.kind !== 'unknown');
}

function activeRule(state: Pick<TicketState, 'systematicType'>): SystematicRule | null {
  if (state.systematicType === null) return null;
  const rule = getSystematicRule(state.systematicType);
  return rule && rule.enabled ? rule : null;
}

/** How many numbers (1-37) each table needs. */
export function numbersPerTable(state: Pick<TicketState, 'systematicType'>): number {
  return activeRule(state)?.numbersCount ?? LOTTO_PICK_COUNT;
}

/** How many strong numbers (1-7) each table needs. */
export function strongPerTable(state: Pick<TicketState, 'systematicType'>): number {
  const rule = activeRule(state);
  return rule && rule.kind === 'strong' ? (rule.strongCount ?? 1) : 1;
}

/** Table counts the user may choose: even numbers within the type's limits, or 1 for a systematic form. */
export function tableCountOptions(state: Pick<TicketState, 'type' | 'systematicType'>): number[] {
  if (activeRule(state)) return [1];
  const { minTables, maxTables, evenTablesOnly } = TICKET_TYPE_LIMITS[state.type];
  const step = evenTablesOnly ? 2 : 1;
  const out: number[] = [];
  for (let n = minTables; n <= maxTables; n += step) out.push(n);
  return out;
}

/** Nearest allowed table count at or below `count` (never below the minimum). */
export function clampTableCount(state: Pick<TicketState, 'type' | 'systematicType'>, count: number): number {
  const options = tableCountOptions(state);
  let best = options[0]!;
  for (const n of options) if (n <= count) best = n;
  return best;
}

function resize(tables: TableState[], count: number): TableState[] {
  if (tables.length === count) return tables;
  if (tables.length > count) return tables.slice(0, count);
  return [...tables, ...Array.from({ length: count - tables.length }, emptyTable)];
}

/** `count` distinct integers from 1..max, ascending (partial Fisher-Yates). */
export function pickUnique(count: number, max: number, rng: Rng): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng(max - i));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count).sort(byValue);
}

function lottomat(state: TicketState, rng: Rng): TableState {
  return {
    numbers: pickUnique(numbersPerTable(state), LOTTO_NUMBER_MAX, rng),
    strongNumbers: pickUnique(strongPerTable(state), LOTTO_STRONG_MAX, rng),
  };
}

function updateTable(state: TicketState, index: number, fn: (t: TableState) => TableState): TicketState {
  if (index < 0 || index >= state.tables.length) return state;
  return { ...state, tables: state.tables.map((t, i) => (i === index ? fn(t) : t)) };
}

function toggle(list: number[], n: number, limit: number): number[] {
  if (list.includes(n)) return list.filter((x) => x !== n);
  if (limit === 1) return [n];
  if (list.length >= limit) return list;
  return [...list, n].sort(byValue);
}

export function ticketReducer(state: TicketState, action: TicketAction): TicketState {
  switch (action.type) {
    case 'setType': {
      const next = { ...state, type: action.ticketType };
      return { ...next, tables: resize(state.tables, clampTableCount(next, state.tables.length)) };
    }
    case 'setTableCount':
      return { ...state, tables: resize(state.tables, clampTableCount(state, action.count)) };
    case 'setSystematic': {
      const id = action.systematicType;
      if (id !== null) {
        const rule = getSystematicRule(id);
        if (!rule || !rule.enabled || rule.kind === 'unknown') return state;
      }
      if (id === state.systematicType) return state;
      const next: TicketState = { ...state, systematicType: id, tables: [] };
      // Number counts change with the type, so the tables start empty.
      const count = id === null ? TICKET_TYPE_LIMITS[state.type].minTables : 1;
      return { ...next, tables: Array.from({ length: count }, emptyTable) };
    }
    case 'toggleNumber':
      if (!Number.isInteger(action.number) || action.number < 1 || action.number > LOTTO_NUMBER_MAX) return state;
      return updateTable(state, action.table, (t) => ({
        ...t,
        numbers: toggle(t.numbers, action.number, numbersPerTable(state)),
      }));
    case 'toggleStrong':
      if (!Number.isInteger(action.number) || action.number < 1 || action.number > LOTTO_STRONG_MAX) return state;
      return updateTable(state, action.table, (t) => ({
        ...t,
        strongNumbers: toggle(t.strongNumbers, action.number, strongPerTable(state)),
      }));
    case 'clearTable':
      return updateTable(state, action.table, emptyTable);
    case 'lottomatTable':
      return updateTable(state, action.table, () => lottomat(state, action.rng));
    case 'lottomatAll':
      return { ...state, tables: state.tables.map(() => lottomat(state, action.rng)) };
    case 'setExtra':
      return { ...state, extra: action.extra };
    case 'setDrawCount': {
      const n = Math.round(action.count);
      if (!Number.isFinite(n)) return state;
      return { ...state, drawCount: Math.min(MAX_DRAW_COUNT, Math.max(1, n)) };
    }
    case 'load':
      return sanitize(action.state);
    default:
      return state;
  }
}

/** Accepts a stored draft only if it still fits the current rules; otherwise starts over. */
export function sanitize(input: unknown): TicketState {
  const fresh = initialTicketState();
  if (!input || typeof input !== 'object') return fresh;
  const s = input as Partial<TicketState>;
  if (s.type !== 'regular' && s.type !== 'double') return fresh;
  if (!Array.isArray(s.tables)) return fresh;
  const candidate: TicketState = {
    type: s.type,
    systematicType: typeof s.systematicType === 'string' ? s.systematicType : null,
    extra: Boolean(s.extra),
    drawCount: typeof s.drawCount === 'number' ? s.drawCount : 1,
    tables: s.tables.map((t) => ({
      numbers: Array.isArray(t?.numbers) ? t.numbers.filter((n) => typeof n === 'number') : [],
      strongNumbers: Array.isArray(t?.strongNumbers) ? t.strongNumbers.filter((n) => typeof n === 'number') : [],
    })),
  };
  if (candidate.systematicType !== null && !activeRule(candidate)) return fresh;
  if (!tableCountOptions(candidate).includes(candidate.tables.length)) return fresh;
  return validateTicket(toTicketInput(candidate)).every((e) => e.code === 'INVALID_NUMBER_COUNT' || e.code === 'INVALID_STRONG_COUNT')
    ? candidate
    : fresh;
}

export function isTableComplete(state: TicketState, index: number): boolean {
  const t = state.tables[index];
  return Boolean(t && t.numbers.length === numbersPerTable(state) && t.strongNumbers.length === strongPerTable(state));
}

export function isTicketComplete(state: TicketState): boolean {
  return state.tables.length > 0 && state.tables.every((_, i) => isTableComplete(state, i));
}

/** The request body for /tickets/calculate, /tickets/check-duplicate and POST /orders `ticket`. */
export function toTicketInput(state: TicketState): TicketInput {
  return {
    type: state.type,
    systematicType: state.systematicType,
    extra: state.extra,
    drawCount: state.drawCount,
    tables: state.tables.map((t) => ({ numbers: [...t.numbers], strongNumbers: [...t.strongNumbers] })),
  };
}

/** Errors from the shared validator; empty when the ticket can be sent. */
export function ticketErrors(state: TicketState): TicketValidationError[] {
  return validateTicket(toTicketInput(state));
}

/** Uniform random integer in [0, maxExclusive) from the Web Crypto API (rejection sampling). */
export const cryptoRng: Rng = (maxExclusive) => {
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return buf[0]! % maxExclusive;
  }
};
