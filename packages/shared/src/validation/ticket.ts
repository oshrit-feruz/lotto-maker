import {
  EXTRA_DIGIT_COUNT,
  EXTRA_DIGIT_MAX,
  LOTTO_NUMBER_MAX,
  LOTTO_PICK_COUNT,
  LOTTO_STRONG_MAX,
  MAX_DRAW_COUNT,
  TICKET_TYPE_LIMITS,
  type TicketType,
} from '../constants/lotto.js';
import { getSystematicRule } from '../constants/systematic.js';
import type { TableInput } from './combinatorics.js';

export interface TicketInput {
  type: TicketType;
  systematicType: string | null;
  extra: boolean;
  drawCount: number;
  tables: TableInput[];
}

export interface TicketValidationError {
  code: string;
  message: string;
  /** Index of the offending table, when the error is about one table. */
  table?: number;
}

const isIntInRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

function validateList(
  values: unknown,
  label: string,
  max: number,
  table: number,
  errors: TicketValidationError[],
): values is number[] {
  if (!Array.isArray(values)) {
    errors.push({ code: 'INVALID_NUMBERS', message: `${label} must be a list`, table });
    return false;
  }
  let ok = true;
  for (const n of values) {
    if (!isIntInRange(n, 1, max)) {
      errors.push({ code: 'NUMBER_OUT_OF_RANGE', message: `${label} must be integers between 1 and ${max}`, table });
      ok = false;
      break;
    }
  }
  if (new Set(values).size !== values.length) {
    errors.push({ code: 'DUPLICATE_NUMBERS', message: `${label} must be unique`, table });
    ok = false;
  }
  return ok;
}

/** Validates a lotto ticket. Used by the backend and the mobile app. Returns all errors found. */
export function validateTicket(input: TicketInput): TicketValidationError[] {
  const errors: TicketValidationError[] = [];

  if (input.type !== 'regular' && input.type !== 'double') {
    errors.push({ code: 'INVALID_TYPE', message: 'type must be regular or double' });
    return errors;
  }
  if (!isIntInRange(input.drawCount, 1, MAX_DRAW_COUNT)) {
    errors.push({ code: 'INVALID_DRAW_COUNT', message: `drawCount must be 1-${MAX_DRAW_COUNT}` });
  }
  if (!Array.isArray(input.tables) || input.tables.length === 0) {
    errors.push({ code: 'INVALID_TABLE_COUNT', message: 'at least one table is required' });
    return errors;
  }

  const rule = input.systematicType === null ? null : getSystematicRule(input.systematicType);
  if (input.systematicType !== null) {
    if (!rule) {
      errors.push({ code: 'UNKNOWN_SYSTEMATIC_TYPE', message: `unknown systematic type ${input.systematicType}` });
      return errors;
    }
    if (!rule.enabled) {
      errors.push({ code: 'SYSTEMATIC_TYPE_DISABLED', message: `${rule.label} is not available yet` });
      return errors;
    }
  }

  if (rule === null) {
    // Plain tables: the count limits apply.
    const limits = TICKET_TYPE_LIMITS[input.type];
    const n = input.tables.length;
    if (n < limits.minTables || n > limits.maxTables) {
      errors.push({
        code: 'INVALID_TABLE_COUNT',
        message: `${input.type} lotto takes ${limits.minTables}-${limits.maxTables} tables`,
      });
    } else if (limits.evenTablesOnly && n % 2 !== 0) {
      errors.push({ code: 'ODD_TABLE_COUNT', message: 'table count must be even' });
    }
  } else if (input.tables.length !== 1) {
    // TODO verify at terminal: a systematic form carries exactly one table.
    errors.push({ code: 'INVALID_TABLE_COUNT', message: 'a systematic ticket has exactly one table' });
  }

  input.tables.forEach((table, i) => {
    const numbersOk = validateList(table?.numbers, 'numbers', LOTTO_NUMBER_MAX, i, errors);
    const strongOk = validateList(table?.strongNumbers, 'strong numbers', LOTTO_STRONG_MAX, i, errors);

    const wantNumbers = rule ? rule.numbersCount : LOTTO_PICK_COUNT;
    const wantStrong = rule && rule.kind === 'strong' ? rule.strongCount : 1;
    if (numbersOk && table.numbers.length !== wantNumbers) {
      errors.push({ code: 'INVALID_NUMBER_COUNT', message: `table needs exactly ${wantNumbers} numbers`, table: i });
    }
    if (strongOk && table.strongNumbers.length !== wantStrong) {
      errors.push({ code: 'INVALID_STRONG_COUNT', message: `table needs exactly ${wantStrong} strong number(s)`, table: i });
    }
  });

  return errors;
}

/** Validates the Extra digits the terminal printed (6 digits, each 1-7). */
export function validateExtraDigits(digits: unknown): digits is number[] {
  return (
    Array.isArray(digits) &&
    digits.length === EXTRA_DIGIT_COUNT &&
    digits.every((d) => isIntInRange(d, 1, EXTRA_DIGIT_MAX))
  );
}

/** Canonical key of a ticket's content, for the duplicate check. */
export function ticketFingerprint(tables: TableInput[], systematicType: string | null): string {
  const parts = tables.map(
    (t) =>
      `${[...t.numbers].sort((a, b) => a - b).join(',')}|${[...t.strongNumbers].sort((a, b) => a - b).join(',')}`,
  );
  return `${systematicType ?? 'plain'}#${parts.sort().join(';')}`;
}
