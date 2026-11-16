import { countTicketCombinations, type TicketInput } from '@lotto-maker/shared';
import { formatShekel, toAmount } from './format';
import type { CalculateResponse, PricesResponse } from './types';

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

const agorot = (v: string | number | null | undefined) => Math.round((toAmount(v) ?? 0) * 100);
const money = (a: number) => (a / 100).toFixed(2);

export type PriceListResult =
  | { ok: true; calc: CalculateResponse }
  /** NO_PRICE: no price row for this ticket type. EXTRA_NOT_AVAILABLE: this type has no Extra price. */
  | { ok: false; reason: 'NO_PRICE' | 'EXTRA_NOT_AVAILABLE' };

/**
 * Prices a ticket from the public price list (GET /prices), with the backend's formula
 * (lib/pricing.ts): combinations × table price, plus Extra once per form, plus the fee, per draw.
 * Used by the logged-out fee calculator; the order itself is still priced by the backend.
 */
export function priceFromList(prices: PricesResponse, input: TicketInput): PriceListResult {
  const row = input.type === 'double' ? prices.double : prices.regular;
  if (!row) return { ok: false, reason: 'NO_PRICE' };
  if (input.extra && row.extraPricePerForm === null) return { ok: false, reason: 'EXTRA_NOT_AVAILABLE' };
  const combinations = countTicketCombinations(input.tables, input.systematicType);
  const pais = agorot(row.pricePerTable) * combinations;
  const extra = input.extra ? agorot(row.extraPricePerForm) : 0;
  const fee = agorot(row.feePerOrder);
  const perOrder = pais + extra + fee;
  return {
    ok: true,
    calc: {
      type: input.type,
      tables: input.tables.length,
      combinations,
      drawCount: input.drawCount,
      perOrder: { paisPrice: money(pais), extraPrice: money(extra), fee: money(fee), total: money(perOrder) },
      total: money(perOrder * input.drawCount),
      // The price list says nothing about which draws are open; the order checks that.
      draws: [],
      enoughDraws: true,
    },
  };
}
