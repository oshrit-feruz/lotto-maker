import { Decimal } from 'decimal.js';
import { countTicketCombinations } from '@lotto-maker/shared';
import type { TableInput, TicketType } from '@lotto-maker/shared';
import { prisma } from '../prisma.js';
import { AppError } from '../plugins/error-handler.js';

/** A PriceList row (Prisma Decimals are accepted through toString). */
export interface PriceRow {
  pricePerTable: { toString(): string };
  extraPricePerTable: { toString(): string } | null;
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

/** Pure. Price = combinations × table price, plus Extra per table, plus our fee. */
export function computeOrderPrice(input: PriceInput, row: PriceRow): PriceBreakdown {
  const combinations = countTicketCombinations(input.tables, input.systematicType);
  const tablePrice = new Decimal(row.pricePerTable.toString());
  const paisPrice = tablePrice.times(combinations);

  let extraPrice = new Decimal(0);
  if (input.extra) {
    if (row.extraPricePerTable === null) {
      throw new AppError(422, 'EXTRA_NOT_AVAILABLE', 'Extra price is not configured');
    }
    extraPrice = new Decimal(row.extraPricePerTable.toString()).times(input.tables.length);
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

/** The price row in force at `at`: the latest effectiveFrom not after it. */
export async function getPriceRow(type: TicketType, at: Date = new Date()) {
  const row = await prisma.priceList.findFirst({
    where: { ticketType: type, effectiveFrom: { lte: at } },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!row) throw new AppError(503, 'PRICE_NOT_CONFIGURED', `No price for ${type} lotto`);
  return row;
}
