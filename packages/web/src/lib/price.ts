import { formatShekel, toAmount } from './format';
import type { CalculateResponse } from './types';

export interface PriceLine {
  label: string;
  value: string;
}

export interface PriceDisplay {
  lines: PriceLine[];
  total: string;
  /** Shown when the order would be refused (not enough announced draws). */
  warning: string | null;
}

/** Turns a POST /tickets/calculate response into the lines the price bar shows. */
export function buildPriceDisplay(calc: CalculateResponse): PriceDisplay {
  const lines: PriceLine[] = [];
  const tablesLabel =
    calc.combinations !== calc.tables
      ? `מחיר הטופס (${calc.tables} טבלאות, ${calc.combinations} צירופים)`
      : `מחיר הטופס (${calc.tables} טבלאות)`;
  lines.push({ label: tablesLabel, value: formatShekel(calc.perOrder.paisPrice) });
  if ((toAmount(calc.perOrder.extraPrice) ?? 0) > 0) {
    lines.push({ label: 'אקסטרה', value: formatShekel(calc.perOrder.extraPrice) });
  }
  lines.push({ label: 'עמלת שירות', value: formatShekel(calc.perOrder.fee) });
  if (calc.drawCount > 1) {
    lines.push({ label: 'סה״כ להגרלה אחת', value: formatShekel(calc.perOrder.total) });
    lines.push({ label: 'מספר הגרלות', value: `× ${calc.drawCount}` });
  }
  const warning = calc.enoughDraws
    ? null
    : `עד כה פורסמו ${calc.draws.length} הגרלות קרובות בלבד, פחות מ־${calc.drawCount} שבחרתם. הקטינו את מספר ההגרלות.`;
  return { lines, total: formatShekel(calc.total), warning };
}

/**
 * How much to top up so the wallet covers `total`. Integer agorot arithmetic,
 * rounded up to the agora; 0 when the balance already covers it.
 */
export function topUpAmount(total: string | number, balance: string | number): number {
  const t = Math.round((toAmount(total) ?? 0) * 100);
  const b = Math.round((toAmount(balance) ?? 0) * 100);
  return Math.max(0, t - b) / 100;
}
