import { Decimal } from 'decimal.js';
import { countTicketCombinations } from '@lotto-maker/shared';
import type { TableInput } from '@lotto-maker/shared';
// No prisma import here: this module must stay loadable in unit tests (getPriceRow is in price-row.ts).
import { AppError } from '../plugins/error-handler.js';

/** A PriceList row (Prisma Decimals are accepted through toString). */
export interface PriceRow {
  pricePerTable: { toString(): string };
  extraPricePerForm: { toString(): string } | null;
  feePerOrder: { toString(): string };
}

export interface PriceInput {
  tables: TableInput[];
  systematicType: string | null;
  extra: boolean;
}

/** Price of ONE order (one ticket for one draw). Amounts are strings with 2 decimals. */
export interface PriceBreakdown {
  /** Plain 6-number combinations the ticket covers (systematic types expand). */
  combinations: number;
  /** What Pais charges for the tables. */
  paisPrice: string;
  /** What Pais charges for Extra, "0.00" when Extra is off. */
  extraPrice: string;
  /** Our fee. */
  fee: string;
  total: string;
}

/** Pure. Price = combinations × table price, plus Extra once per form, plus our fee. */
export function computeOrderPrice(input: PriceInput, row: PriceRow): PriceBreakdown {
  const combinations = countTicketCombinations(input.tables, input.systematicType);
  const tablePrice = new Decimal(row.pricePerTable.toString());
  const paisPrice = tablePrice.times(combinations);

  let extraPrice = new Decimal(0);
  if (input.extra) {
    if (row.extraPricePerForm === null) {
      throw new AppError(422, 'EXTRA_NOT_AVAILABLE', 'Extra price is not configured');
    }
    // Once per form (order), regardless of the number of tables
    extraPrice = new Decimal(row.extraPricePerForm.toString());
  }

  const fee = new Decimal(row.feePerOrder.toString());
  return {
    combinations,
    paisPrice: paisPrice.toFixed(2),
    extraPrice: extraPrice.toFixed(2),
    fee: fee.toFixed(2),
    total: paisPrice.plus(extraPrice).plus(fee).toFixed(2),
  };
}
