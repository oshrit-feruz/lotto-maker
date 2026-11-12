import { getSystematicRule } from '../constants/systematic.js';

export interface Combination {
  /** 6 numbers, ascending. */
  numbers: number[];
  strong: number;
}

export interface TableInput {
  numbers: number[];
  strongNumbers: number[];
}

/** C(n, k) as an exact integer (n is small here). */
export function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
  return Math.round(result);
}

/** All k-element subsets of `items`, preserving order. */
export function subsets<T>(items: readonly T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number) => {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i] as T);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

const byValue = (a: number, b: number) => a - b;

/**
 * Expand one table into the plain 6-number combinations it covers.
 * A plain table (no systematic type) is one combination.
 */
export function expandTable(table: TableInput, systematicType: string | null): Combination[] {
  const nums = [...table.numbers].sort(byValue);
  if (systematicType === null) {
    return [{ numbers: nums, strong: table.strongNumbers[0] as number }];
  }
  const rule = getSystematicRule(systematicType);
  if (!rule) throw new Error(`Unknown systematic type: ${systematicType}`);
  if (rule.kind === 'full') {
    const strong = table.strongNumbers[0] as number;
    return subsets(nums, 6).map((numbers) => ({ numbers, strong }));
  }
  if (rule.kind === 'strong') {
    return [...table.strongNumbers].sort(byValue).map((strong) => ({ numbers: nums, strong }));
  }
  throw new Error(`Systematic type ${systematicType} has no verified rule`);
}

/** Number of combinations a table covers, without expanding it. */
export function countCombinations(table: TableInput, systematicType: string | null): number {
  if (systematicType === null) return 1;
  const rule = getSystematicRule(systematicType);
  if (!rule) throw new Error(`Unknown systematic type: ${systematicType}`);
  if (rule.kind === 'full') return binomial(table.numbers.length, 6);
  if (rule.kind === 'strong') return table.strongNumbers.length;
  throw new Error(`Systematic type ${systematicType} has no verified rule`);
}

export function expandTickets(tables: TableInput[], systematicType: string | null): Combination[] {
  return tables.flatMap((t) => expandTable(t, systematicType));
}

export function countTicketCombinations(tables: TableInput[], systematicType: string | null): number {
  return tables.reduce((sum, t) => sum + countCombinations(t, systematicType), 0);
}
