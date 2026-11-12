import type { DrawDetail, EditResultsBody } from '../api/types';
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

/** Validates the form and builds the request body, or returns a Hebrew error message. */
export function toBody(f: DrawForm): EditResultsBody | string {
  const nums = f.numbers.map(Number);
  const extra = f.extraDigits.map(Number);
  if (f.numbers.some((n) => n === '') || nums.some((n) => !Number.isInteger(n) || n < 1 || n > 37))
    return 'המספרים חייבים להיות 1–37';
  if (new Set(nums).size !== nums.length) return 'המספרים חייבים להיות שונים';
  const strong = Number(f.strong);
  if (f.strong === '' || !Number.isInteger(strong) || strong < 1 || strong > 7) return 'המספר החזק חייב להיות 1–7';
  if (f.extraDigits.some((n) => n === '') || extra.some((n) => !Number.isInteger(n) || n < 1 || n > 7))
    return 'ספרות אקסטרה חייבות להיות 1–7';
  const prizeTiers: EditResultsBody['prizeTiers'] = [];
  for (const g of GAMES) {
    for (const t of TIER_KEYS[g]) {
      const row = f.tiers[tierId(g, t)];
      const winners = row?.winners.trim() ?? '';
      const amount = row?.amount.trim() ?? '';
      if (amount === '') {
        // An empty row means "not set"; winners without a prize amount is an input mistake.
        if (winners !== '') return `בטבלת ${GAME_LABEL[g]} (${t}) הוזן מספר זוכים ללא סכום פרס`;
        continue;
      }
      const winnersCount = Number(winners || 0);
      const prizeAmount = Number(amount);
      if (!Number.isInteger(winnersCount) || winnersCount < 0 || !Number.isFinite(prizeAmount) || prizeAmount < 0)
        return `ערך לא תקין בטבלת ${GAME_LABEL[g]} (${t})`;
      prizeTiers.push({ game: g, tier: t, winnersCount, prizeAmount });
    }
  }
  if (prizeTiers.length === 0) return 'יש להזין לפחות דרגת פרס אחת';
  return { numbers: nums, strong, extraDigits: extra, prizeTiers };
}
