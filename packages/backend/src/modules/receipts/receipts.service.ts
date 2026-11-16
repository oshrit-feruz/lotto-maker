import { Decimal } from 'decimal.js';
import { TIMEZONE } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { config } from '../../config.js';
import { AppError } from '../../plugins/error-handler.js';
import type { Tx } from '../wallet/wallet.service.js';

/** Order statuses that mean the customer was charged. */
const NOT_PAID_STATUSES = ['pending', 'cancelled'];

/**
 * Splits a fee that includes VAT into net and VAT: net = fee / (1 + rate), rounded to the agora;
 * VAT is the rest, so net + VAT always equals the fee exactly.
 */
export function computeVat(fee: Decimal.Value, rate: Decimal.Value) {
  const gross = new Decimal(fee).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const net = gross.div(new Decimal(rate).plus(1)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { gross, net, vat: gross.minus(net) };
}

/** The receipt year is the calendar year in Israel, not UTC. */
export function receiptYear(now: Date): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric' }).format(now));
}

export function formatReceiptNumber(year: number, seq: number): string {
  return `${year}-${String(seq).padStart(6, '0')}`;
}

/**
 * Takes the next number of the year. The upsert locks the counter row until the caller's
 * transaction ends, so concurrent issuers queue up; if the transaction rolls back the increment
 * rolls back with it. Numbers therefore never repeat and never skip.
 */
export async function allocateReceiptNumberTx(tx: Tx, now: Date) {
  const year = receiptYear(now);
  const rows = await tx.$queryRaw<Array<{ last: number }>>`
    INSERT INTO "ReceiptCounter" ("year", "last") VALUES (${year}, 1)
    ON CONFLICT ("year") DO UPDATE SET "last" = "ReceiptCounter"."last" + 1
    RETURNING "last"
  `;
  const seq = Number(rows[0]!.last);
  return { year, seq, number: formatReceiptNumber(year, seq) };
}

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === 'P2002';

/** Shown in place of a missing business detail outside production, so it is obvious on the page. */
export const MISSING_BUSINESS_DETAIL_PLACEHOLDER = '[חסר בהגדרות – סביבת פיתוח בלבד]';

export interface IssuerSnapshot {
  businessName: string;
  businessId: string;
  businessAddress: string;
}

/**
 * The issuer details stored on each new receipt. In production a receipt without the business
 * name and number is not issued at all: this throws, the caller logs it and the sweep issues
 * the receipt once the configuration is complete. Elsewhere a visible placeholder stands in.
 */
export function currentIssuer(): IssuerSnapshot {
  const businessName = config.BUSINESS_NAME.trim();
  const businessId = config.BUSINESS_ID.trim();
  const businessAddress = config.BUSINESS_ADDRESS.trim();
  if (!businessName || !businessId) {
    if (config.NODE_ENV === 'production') {
      throw new AppError(503, 'BUSINESS_DETAILS_MISSING', 'BUSINESS_NAME and BUSINESS_ID must be set to issue receipts');
    }
    return {
      businessName: businessName || MISSING_BUSINESS_DETAIL_PLACEHOLDER,
      businessId: businessId || MISSING_BUSINESS_DETAIL_PLACEHOLDER,
      businessAddress,
    };
  }
  return { businessName, businessId, businessAddress };
}

async function issueReceiptTx(tx: Tx, orderId: string, now: Date) {
  const existing = await tx.receipt.findFirst({ where: { orderId, kind: 'receipt' } });
  if (existing) return existing;

  const issuer = currentIssuer();

  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, fee: true, status: true },
  });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND');
  if (NOT_PAID_STATUSES.includes(order.status)) throw new AppError(409, 'ORDER_NOT_PAID');

  const user = await tx.user.findUnique({
    where: { id: order.userId },
    select: { fullName: true, idLast4: true },
  });
  const { gross, net, vat } = computeVat(order.fee.toString(), config.VAT_RATE);
  const { year, seq, number } = await allocateReceiptNumberTx(tx, now);

  return tx.receipt.create({
    data: {
      number,
      year,
      seq,
      kind: 'receipt',
      orderId,
      userId: order.userId,
      customerName: user?.fullName ?? null,
      idLast4: user?.idLast4 ?? null,
      feeAmount: gross.toFixed(2),
      vatRate: new Decimal(config.VAT_RATE).toFixed(4),
      vatAmount: vat.toFixed(2),
      netAmount: net.toFixed(2),
      ...issuer,
      issuedAt: now,
    },
  });
}

/** Receipt for the service fee of a paid order. Idempotent: an order has one receipt. */
export async function issueReceiptForOrder(orderId: string, now = new Date()) {
  try {
    return await prisma.$transaction((tx: Tx) => issueReceiptTx(tx, orderId, now));
  } catch (err) {
    // A concurrent issuer won the unique index; our transaction (and its number) rolled back.
    // Only a receipt that now exists answers for it: any other unique conflict is a real error.
    if (!isUniqueViolation(err)) throw err;
    const existing = await prisma.receipt.findFirst({ where: { orderId, kind: 'receipt' } });
    if (!existing) throw err;
    return existing;
  }
}

/**
 * Credit receipt for a refunded order, referencing the original receipt (issued first if it is
 * somehow missing). Amounts are the original's, negated. Idempotent.
 */
export async function issueCreditReceiptForOrder(orderId: string, now = new Date()) {
  try {
    return await prisma.$transaction(async (tx: Tx) => {
      const existing = await tx.receipt.findFirst({ where: { orderId, kind: 'credit' } });
      if (existing) return existing;

      const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND');
      if (order.status !== 'refunded') throw new AppError(409, 'ORDER_NOT_REFUNDED');

      const original = await issueReceiptTx(tx, orderId, now);
      // The credit receipt is a new document: it carries the issuer details of today
      const issuer = currentIssuer();
      const { year, seq, number } = await allocateReceiptNumberTx(tx, now);
      const neg = (v: { toString(): string }) => new Decimal(v.toString()).negated().toFixed(2);

      return tx.receipt.create({
        data: {
          number,
          year,
          seq,
          kind: 'credit',
          orderId,
          userId: original.userId,
          originalReceiptId: original.id,
          customerName: original.customerName,
          idLast4: original.idLast4,
          feeAmount: neg(original.feeAmount),
          vatRate: original.vatRate.toString(),
          vatAmount: neg(original.vatAmount),
          netAmount: neg(original.netAmount),
          ...issuer,
          issuedAt: now,
        },
      });
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // "Already exists" only if the conflict was a concurrent credit receipt. A conflict on the
    // original receipt (a background issuer created it first) leaves no credit: rethrow, and the
    // sweep retries it.
    const credit = await prisma.receipt.findFirst({ where: { orderId, kind: 'credit' } });
    if (!credit) throw err;
    return credit;
  }
}

/** Issues the receipts of freshly created orders, in order, after the order transaction committed. */
export function issueReceiptsInBackground(orderIds: string[]): void {
  void (async () => {
    for (const id of orderIds) {
      try {
        await issueReceiptForOrder(id);
      } catch (err) {
        // The sweep (issueMissingReceipts) picks it up
        console.error(`[receipts] could not issue receipt for order ${id}:`, err);
      }
    }
  })();
}

let sweeping = false;

/**
 * Safety net: issues receipts that are missing (the background issue failed, or an order was
 * refunded) and credit receipts for refunded orders. Oldest first, so numbers follow the order of events.
 */
export async function issueMissingReceipts(limit = 200): Promise<{ receipts: number; credits: number }> {
  const tally = { receipts: 0, credits: 0 };
  if (sweeping) return tally;
  try {
    currentIssuer();
  } catch (err) {
    // One line per sweep rather than one per order; the receipts wait until the config is set
    console.error('[receipts] not issuing receipts:', err instanceof Error ? err.message : err);
    return tally;
  }
  sweeping = true;
  try {
    const missing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT o."id" FROM "Order" o
      LEFT JOIN "Receipt" r ON r."orderId" = o."id" AND r."kind" = 'receipt'
      WHERE r."id" IS NULL AND o."status"::text NOT IN ('pending', 'cancelled')
      ORDER BY o."createdAt" ASC LIMIT ${limit}
    `;
    for (const { id } of missing) {
      try {
        await issueReceiptForOrder(id);
        tally.receipts++;
      } catch (err) {
        console.error(`[receipts] order ${id}:`, err);
      }
    }

    const refunded = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT o."id" FROM "Order" o
      LEFT JOIN "Receipt" c ON c."orderId" = o."id" AND c."kind" = 'credit'
      WHERE o."status"::text = 'refunded' AND c."id" IS NULL
      ORDER BY o."updatedAt" ASC LIMIT ${limit}
    `;
    for (const { id } of refunded) {
      try {
        await issueCreditReceiptForOrder(id);
        tally.credits++;
      } catch (err) {
        console.error(`[receipts] credit for order ${id}:`, err);
      }
    }
  } finally {
    sweeping = false;
  }
  return tally;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function listReceipts(userId: string, params: { page: number; limit: number }) {
  const where = { userId };
  const [data, total] = await Promise.all([
    prisma.receipt.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      select: {
        id: true,
        number: true,
        kind: true,
        orderId: true,
        feeAmount: true,
        vatAmount: true,
        netAmount: true,
        issuedAt: true,
      },
    }),
    prisma.receipt.count({ where }),
  ]);
  return { data, total, page: params.page, limit: params.limit };
}

/** A receipt for its owner, with the number of the receipt it credits (if any). */
export async function getReceipt(id: string, userId: string) {
  const receipt = await prisma.receipt.findUnique({ where: { id } });
  if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND');
  if (receipt.userId !== userId) throw new AppError(403, 'FORBIDDEN');
  const original = receipt.originalReceiptId
    ? await prisma.receipt.findUnique({ where: { id: receipt.originalReceiptId }, select: { number: true } })
    : null;
  return { receipt, originalNumber: original?.number ?? null };
}
