import type { DrawDetail, EditResultsBody, PrizeGame } from '../api/types';
import { GAMES, GAME_LABEL, TIER_KEYS } from './payout';

export interface DrawForm {
  numbers: string[];
  strong: string;
  extraDigits: string[];
  tiers: Record<string, { winners: string; amount: string }>;
}

export const tierId = (game: string, tier: string) => `${game}:${tier}`;

/**
 * Results can be edited until the draw is settled. A confirmed draw stays editable only while it
 * needs attention: the backend accepts a correction then so settlement can be retried.
 */
export function isDrawReadOnly(d: Pick<DrawDetail, 'status' | 'needsAttention'>): boolean {
  if (d.status === 'settled') return true;
  if (d.status === 'results_confirmed') return !d.needsAttention;
  return false;
}

export function toForm(d: DrawDetail): DrawForm {
  const pad = (a: number[], n: number) => Array.from({ length: n }, (_, i) => (a[i] !== undefined ? String(a[i]) : ''));
  const tiers: DrawForm['tiers'] = {};
  for (const g of GAMES) {
    for (const t of TIER_KEYS[g]) {
      const found = d.prizeTiers.find((p) => p.game === g && p.tier === t);
      tiers[tierId(g, t)] = found
        ? { winners: String(found.winnersCount), amount: String(Number(found.prizeAmount)) }
        : { winners: '', amount: '' };
    }
  }
  return { numbers: pad(d.numbers, 6), strong: d.strong === null ? '' : String(d.strong), extraDigits: pad(d.extraDigits, 6), tiers };
}

type PrizeTierBody = EditResultsBody['prizeTiers'][number];

/** Every value is filled in and is an integer from `min` to `max`. */
const allInRange = (values: string[], min: number, max: number) =>
  !values.includes('') &&
  values.every((v) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max;
  });

/** The first problem with the winning numbers, strong number and extra digits, or null. */
function numbersError(f: DrawForm): string | null {
  if (!allInRange(f.numbers, 1, 37)) return 'המספרים חייבים להיות 1–37';
  if (new Set(f.numbers.map(Number)).size !== f.numbers.length) return 'המספרים חייבים להיות שונים';
  if (!allInRange([f.strong], 1, 7)) return 'המספר החזק חייב להיות 1–7';
  if (!allInRange(f.extraDigits, 1, 7)) return 'ספרות אקסטרה חייבות להיות 1–7';
  return null;
}

/**
 * One prize-table row: the tier to send, null when the row is empty ("not set"), or an error.
 * Winners without a prize amount is an input mistake; empty winners with an amount means 0.
 */
function parseTier(game: PrizeGame, tier: string, row: DrawForm['tiers'][string] | undefined): PrizeTierBody | null | string {
  const winners = row?.winners.trim() ?? '';
  const amount = row?.amount.trim() ?? '';
  if (amount === '') return winners === '' ? null : `בטבלת ${GAME_LABEL[game]} (${tier}) הוזן מספר זוכים ללא סכום פרס`;
  const winnersCount = Number(winners || 0);
  const prizeAmount = Number(amount);
  if (!Number.isInteger(winnersCount) || winnersCount < 0 || !Number.isFinite(prizeAmount) || prizeAmount < 0)
    return `ערך לא תקין בטבלת ${GAME_LABEL[game]} (${tier})`;
  return { game, tier, winnersCount, prizeAmount };
}

/** The filled prize-table rows in table order, or the first row's error. */
function prizeTiersOf(f: DrawForm): PrizeTierBody[] | string {
  const tiers: PrizeTierBody[] = [];
  for (const g of GAMES) {
    for (const t of TIER_KEYS[g]) {
      const parsed = parseTier(g, t, f.tiers[tierId(g, t)]);
      if (typeof parsed === 'string') return parsed;
      if (parsed) tiers.push(parsed);
    }
  }
  return tiers;
}

/** Validates the form and builds the request body, or returns a Hebrew error message. */
export function toBody(f: DrawForm): EditResultsBody | string {
  const error = numbersError(f);
  if (error) return error;
  const prizeTiers = prizeTiersOf(f);
  if (typeof prizeTiers === 'string') return prizeTiers;
  if (prizeTiers.length === 0) return 'יש להזין לפחות דרגת פרס אחת';
  return { numbers: f.numbers.map(Number), strong: Number(f.strong), extraDigits: f.extraDigits.map(Number), prizeTiers };
}
