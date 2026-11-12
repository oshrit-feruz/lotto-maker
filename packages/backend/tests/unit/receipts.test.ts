import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const h = vi.hoisted(() => {
  const s = {
    orders: new Map<string, any>(),
    users: new Map<string, any>(),
    receipts: [] as any[],
    counters: new Map<number, number>(),
    seq: 0,
    /** Runs once before the next receipt.create (to stage a concurrent writer). */
    beforeCreate: null as null | ((data: any) => void),
  };
  const uniqueError = () => Object.assign(new Error('unique'), { code: 'P2002' });
  const match = (r: any, where: any) => Object.entries(where).every(([k, v]) => r[k] === v);

  const fake: any = {
    order: { findUnique: async ({ where }: any) => s.orders.get(where.id) ?? null },
    user: { findUnique: async ({ where }: any) => s.users.get(where.id) ?? null },
    receipt: {
      findFirst: async ({ where }: any) => s.receipts.find((r) => match(r, where)) ?? null,
      findUnique: async ({ where }: any) => s.receipts.find((r) => match(r, where)) ?? null,
      findMany: async ({ where }: any) => s.receipts.filter((r) => match(r, where)),
      count: async ({ where }: any) => s.receipts.filter((r) => match(r, where)).length,
      create: async ({ data }: any) => {
        const hook = s.beforeCreate;
        s.beforeCreate = null;
        hook?.(data);
        if (s.receipts.some((r) => r.number === data.number || (r.orderId === data.orderId && r.kind === data.kind))) {
          throw uniqueError();
        }
        const row = {
          id: `rcp_${++s.seq}`,
          originalReceiptId: null,
          ...data,
          feeAmount: new Decimal(data.feeAmount),
          vatRate: new Decimal(data.vatRate),
          vatAmount: new Decimal(data.vatAmount),
          netAmount: new Decimal(data.netAmount),
        };
        s.receipts.push(row);
        return row;
      },
    },
    // The counter upsert and the two sweep queries
    $queryRaw: async (strings: TemplateStringsArray, ...values: any[]) => {
      const sql = strings.join('?');
      if (sql.includes('ReceiptCounter')) {
        // No await between read and write: like the row lock, callers are serialised
        const year = values[0] as number;
        const last = (s.counters.get(year) ?? 0) + 1;
        s.counters.set(year, last);
        return [{ last }];
      }
      if (sql.includes(`"kind" = 'receipt'`)) {
        return [...s.orders.values()]
          .filter((o) => !['pending', 'cancelled'].includes(o.status))
          .filter((o) => !s.receipts.some((r) => r.orderId === o.id && r.kind === 'receipt'))
          .map((o) => ({ id: o.id }));
      }
      return [...s.orders.values()]
        .filter((o) => o.status === 'refunded')
        .filter((o) => !s.receipts.some((r) => r.orderId === o.id && r.kind === 'credit'))
        .map((o) => ({ id: o.id }));
    },
    $transaction: async (fn: any) => fn(fake),
  };
  return { s, fake };
});

vi.mock('../../src/prisma.js', () => ({ prisma: h.fake }));

import {
  computeVat,
  formatReceiptNumber,
  getReceipt,
  issueCreditReceiptForOrder,
  issueMissingReceipts,
  issueReceiptForOrder,
  receiptYear,
  MISSING_BUSINESS_DETAIL_PLACEHOLDER,
} from '../../src/modules/receipts/receipts.service.js';
import { formatVatPercent, NOT_TAX_INVOICE_NOTICE, renderReceiptHtml } from '../../src/modules/receipts/receipt-html.js';
import { config } from '../../src/config.js';

const NOW = new Date('2026-03-01T10:00:00Z');
const cfg = config as any;
const ORIGINAL_CONFIG = {
  NODE_ENV: cfg.NODE_ENV,
  BUSINESS_NAME: cfg.BUSINESS_NAME,
  BUSINESS_ID: cfg.BUSINESS_ID,
  BUSINESS_ADDRESS: cfg.BUSINESS_ADDRESS,
  VAT_RATE: cfg.VAT_RATE,
};

function addOrder(id: string, fee: string, status = 'in_queue', userId = 'u1') {
  h.s.orders.set(id, { id, userId, fee: new Decimal(fee), status });
}

beforeEach(() => {
  h.s.orders.clear();
  h.s.users.clear();
  h.s.receipts.length = 0;
  h.s.counters.clear();
  h.s.seq = 0;
  h.s.beforeCreate = null;
  h.s.users.set('u1', { id: 'u1', fullName: 'דנה לוי', idLast4: '6782' });
  Object.assign(cfg, ORIGINAL_CONFIG, {
    BUSINESS_NAME: 'לוטו מייקר בע״מ',
    BUSINESS_ID: '515123456',
    BUSINESS_ADDRESS: 'הרצל 1, תל אביב',
  });
});

afterEach(() => {
  Object.assign(cfg, ORIGINAL_CONFIG);
  vi.restoreAllMocks();
});

describe('VAT maths', () => {
  it('splits a VAT-inclusive fee into net and VAT at 18%', () => {
    const r = computeVat('11.80', 0.18);
    expect(r.net.toFixed(2)).toBe('10.00');
    expect(r.vat.toFixed(2)).toBe('1.80');
    expect(r.gross.toFixed(2)).toBe('11.80');
  });

  it('rounds to the agora and net + VAT always equals the fee', () => {
    for (const fee of ['10.00', '0.99', '5.90', '7.77', '12.34', '100.01']) {
      const r = computeVat(fee, 0.18);
      expect(r.net.plus(r.vat).toFixed(2)).toBe(new Decimal(fee).toFixed(2));
    }
    const ten = computeVat('10.00', 0.18);
    expect(ten.net.toFixed(2)).toBe('8.47');
    expect(ten.vat.toFixed(2)).toBe('1.53');
  });

  it('follows the configured rate, and zero VAT leaves the net equal to the fee', () => {
    expect(computeVat('10.00', 0.17).net.toFixed(2)).toBe('8.55');
    const zero = computeVat('10.00', 0);
    expect(zero.net.toFixed(2)).toBe('10.00');
    expect(zero.vat.toFixed(2)).toBe('0.00');
  });
});

describe('receipt for a paid order', () => {
  it('stores the fee, VAT, net, customer name, ID last 4 and the order id', async () => {
    addOrder('o1', '11.80');
    const r = await issueReceiptForOrder('o1', NOW);
    expect(r).toMatchObject({
      number: '2026-000001',
      kind: 'receipt',
      orderId: 'o1',
      userId: 'u1',
      customerName: 'דנה לוי',
      idLast4: '6782',
      feeAmount: new Decimal('11.80'),
      vatAmount: new Decimal('1.80'),
      netAmount: new Decimal('10.00'),
    });
    expect(r!.vatRate.toNumber()).toBe(0.18);
  });

  it('is idempotent: an order has one receipt and no number is wasted', async () => {
    addOrder('o1', '10.00');
    addOrder('o2', '10.00');
    const a = await issueReceiptForOrder('o1', NOW);
    const again = await issueReceiptForOrder('o1', NOW);
    const b = await issueReceiptForOrder('o2', NOW);
    expect(again!.id).toBe(a!.id);
    expect(b!.number).toBe('2026-000002');
  });

  it('refuses an order that was never paid', async () => {
    addOrder('o1', '10.00', 'pending');
    await expect(issueReceiptForOrder('o1', NOW)).rejects.toMatchObject({ code: 'ORDER_NOT_PAID' });
    expect(h.s.counters.size).toBe(0);
  });
});

describe('numbering', () => {
  it('is sequential per year: 2026-000001, 2026-000002, …', async () => {
    for (let i = 1; i <= 3; i++) addOrder(`o${i}`, '10.00');
    const numbers = [];
    for (let i = 1; i <= 3; i++) numbers.push((await issueReceiptForOrder(`o${i}`, NOW))!.number);
    expect(numbers).toEqual(['2026-000001', '2026-000002', '2026-000003']);
  });

  it('never repeats or skips under concurrent calls', async () => {
    const N = 25;
    for (let i = 1; i <= N; i++) addOrder(`o${i}`, '10.00');
    const results = await Promise.all(Array.from({ length: N }, (_, i) => issueReceiptForOrder(`o${i + 1}`, NOW)));

    const seqs = results.map((r) => r!.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(new Set(results.map((r) => r!.number)).size).toBe(N);
  });

  it('concurrent calls for the same order give it one receipt', async () => {
    addOrder('o1', '10.00');
    const results = await Promise.all(Array.from({ length: 5 }, () => issueReceiptForOrder('o1', NOW)));
    expect(new Set(results.map((r) => r!.id)).size).toBe(1);
    expect(h.s.receipts).toHaveLength(1);
  });

  it('restarts at 1 each year, counting the year in Israel time', async () => {
    addOrder('o1', '10.00');
    addOrder('o2', '10.00');
    addOrder('o3', '10.00');
    expect((await issueReceiptForOrder('o1', new Date('2026-12-31T10:00:00Z')))!.number).toBe('2026-000001');
    // 22:30 UTC on 31 Dec is already 1 Jan in Israel
    expect((await issueReceiptForOrder('o2', new Date('2026-12-31T22:30:00Z')))!.number).toBe('2027-000001');
    expect((await issueReceiptForOrder('o3', new Date('2027-01-02T10:00:00Z')))!.number).toBe('2027-000002');
    expect(receiptYear(new Date('2026-12-31T22:30:00Z'))).toBe(2027);
    expect(formatReceiptNumber(2026, 42)).toBe('2026-000042');
  });
});

describe('credit receipt on refund', () => {
  it('references the original and carries the negated amounts', async () => {
    addOrder('o1', '11.80');
    const original = await issueReceiptForOrder('o1', NOW);
    h.s.orders.get('o1').status = 'refunded';

    const credit = await issueCreditReceiptForOrder('o1', NOW);
    expect(credit).toMatchObject({
      kind: 'credit',
      number: '2026-000002',
      originalReceiptId: original!.id,
      orderId: 'o1',
      feeAmount: new Decimal('-11.80'),
      vatAmount: new Decimal('-1.80'),
      netAmount: new Decimal('-10.00'),
    });
  });

  it('is issued once, and not for an order that is not refunded', async () => {
    addOrder('o1', '10.00');
    await issueReceiptForOrder('o1', NOW);
    await expect(issueCreditReceiptForOrder('o1', NOW)).rejects.toMatchObject({ code: 'ORDER_NOT_REFUNDED' });

    h.s.orders.get('o1').status = 'refunded';
    const a = await issueCreditReceiptForOrder('o1', NOW);
    const b = await issueCreditReceiptForOrder('o1', NOW);
    expect(b!.id).toBe(a!.id);
    expect(h.s.receipts.filter((r) => r.kind === 'credit')).toHaveLength(1);
  });

  it('issues the missing original first when the order was refunded before its receipt', async () => {
    addOrder('o1', '10.00', 'refunded');
    const credit = await issueCreditReceiptForOrder('o1', NOW);
    const original = h.s.receipts.find((r) => r.kind === 'receipt');
    expect(original.number).toBe('2026-000001');
    expect(credit!.number).toBe('2026-000002');
    expect(credit!.originalReceiptId).toBe(original.id);
  });

  it('the sweep issues missing receipts and credit receipts, oldest first', async () => {
    addOrder('o1', '10.00');
    addOrder('o2', '10.00', 'refunded');
    addOrder('o3', '10.00', 'pending');
    const tally = await issueMissingReceipts();
    expect(tally).toEqual({ receipts: 2, credits: 1 });
    expect(h.s.receipts.map((r) => `${r.kind}:${r.orderId}`).sort()).toEqual([
      'credit:o2',
      'receipt:o1',
      'receipt:o2',
    ]);
    // nothing left to do
    expect(await issueMissingReceipts()).toEqual({ receipts: 0, credits: 0 });
  });
});

describe('receipt page', () => {
  const business = { name: 'לוטו מייקר בע״מ', id: '515123456', address: 'הרצל 1, תל אביב' };

  it('is Hebrew RTL, shows the business and the fee split, and says it is not a tax invoice', async () => {
    addOrder('o1', '11.80');
    const r = await issueReceiptForOrder('o1', NOW);
    const html = renderReceiptHtml(r as any, business, null);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="he"');
    expect(html).toContain(NOT_TAX_INVOICE_NOTICE);
    expect(html).toContain('אינו חשבונית מס');
    expect(html).toContain('2026-000001');
    expect(html).toContain('515123456');
    expect(html).toContain('₪11.80');
    expect(html).toContain('₪10.00');
    expect(html).toContain('₪1.80');
    expect(html).toContain('18%');
    expect(html).toContain('****6782');
    expect(html).not.toContain('123456782');
  });

  it('escapes customer-controlled text', async () => {
    h.s.users.set('u1', { id: 'u1', fullName: '<script>alert(1)</script>', idLast4: '6782' });
    addOrder('o1', '10.00');
    const html = renderReceiptHtml((await issueReceiptForOrder('o1', NOW)) as any, business, null);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('a credit receipt names the receipt it credits', async () => {
    addOrder('o1', '10.00', 'refunded');
    const credit = await issueCreditReceiptForOrder('o1', NOW);
    const html = renderReceiptHtml(credit as any, business, '2026-000001');
    expect(html).toContain('קבלת זיכוי');
    expect(html).toContain('מתייחס לקבלה מספר');
    expect(html).toContain('2026-000001');
    expect(html).toContain('₪-10.00');
  });

  it('only the owner can read a receipt', async () => {
    addOrder('o1', '10.00');
    const r = await issueReceiptForOrder('o1', NOW);
    await expect(getReceipt(r!.id, 'someone-else')).rejects.toMatchObject({ statusCode: 403 });
    await expect(getReceipt('missing', 'u1')).rejects.toMatchObject({ statusCode: 404 });
    await expect(getReceipt(r!.id, 'u1')).resolves.toMatchObject({ originalNumber: null });
  });

  it('shows a fractional VAT rate exactly: 17.5% stays 17.5%, not 18%', async () => {
    cfg.VAT_RATE = 0.175;
    addOrder('o1', '11.75');
    const r = await issueReceiptForOrder('o1', NOW);
    expect(r!.vatRate.toString()).toBe('0.175');
    const html = renderReceiptHtml(r as any, business, null);
    expect(html).toContain('17.5%');
    expect(html).not.toContain('18%');
    expect(formatVatPercent(new Decimal('0.1800'))).toBe('18%');
    expect(formatVatPercent(new Decimal('0.1750'))).toBe('17.5%');
    expect(formatVatPercent(new Decimal('0'))).toBe('0%');
  });
});

describe('issuer details', () => {
  const other = { name: 'שם אחר', id: '999999999', address: 'כתובת אחרת' };

  it('are stored on the receipt and rendered from it, so a later config change leaves it as issued', async () => {
    addOrder('o1', '10.00');
    const r = await issueReceiptForOrder('o1', NOW);
    expect(r).toMatchObject({ businessName: 'לוטו מייקר בע״מ', businessId: '515123456', businessAddress: 'הרצל 1, תל אביב' });

    // The business details change afterwards: the existing receipt still shows the old ones
    Object.assign(cfg, { BUSINESS_NAME: other.name, BUSINESS_ID: other.id, BUSINESS_ADDRESS: other.address });
    const html = renderReceiptHtml(r as any, other, null);
    expect(html).toContain('515123456');
    expect(html).toContain('הרצל 1, תל אביב');
    expect(html).not.toContain(other.id);
    expect(html).not.toContain(other.address);
  });

  it('a credit receipt carries the issuer details of the day it is issued', async () => {
    addOrder('o1', '10.00');
    await issueReceiptForOrder('o1', NOW);
    h.s.orders.get('o1').status = 'refunded';
    Object.assign(cfg, { BUSINESS_NAME: other.name, BUSINESS_ID: other.id, BUSINESS_ADDRESS: other.address });
    const credit = await issueCreditReceiptForOrder('o1', NOW);
    expect(credit).toMatchObject({ businessName: other.name, businessId: other.id, businessAddress: other.address });
  });

  it('a receipt from before snapshots existed falls back to the current config', () => {
    const legacy = {
      number: '2026-000009',
      kind: 'receipt',
      orderId: 'o9',
      customerName: null,
      idLast4: null,
      feeAmount: new Decimal('10'),
      vatRate: new Decimal('0.18'),
      vatAmount: new Decimal('1.53'),
      netAmount: new Decimal('8.47'),
      businessName: null,
      businessId: null,
      businessAddress: null,
      issuedAt: NOW,
    };
    expect(renderReceiptHtml(legacy as any, other, null)).toContain(other.id);
  });

  it.each([
    ['BUSINESS_NAME', { BUSINESS_NAME: '' }],
    ['BUSINESS_ID', { BUSINESS_ID: '  ' }],
  ])('production: no receipt is issued while %s is empty, and no number is used', async (_name, patch) => {
    Object.assign(cfg, { NODE_ENV: 'production' }, patch);
    addOrder('o1', '10.00');
    await expect(issueReceiptForOrder('o1', NOW)).rejects.toMatchObject({ statusCode: 503, code: 'BUSINESS_DETAILS_MISSING' });
    expect(h.s.receipts).toHaveLength(0);
    expect(h.s.counters.size).toBe(0);

    // The sweep logs it once and leaves the receipt for later…
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await issueMissingReceipts()).toEqual({ receipts: 0, credits: 0 });
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0]![1])).toContain('BUSINESS_NAME');

    // …and issues it once the details are set
    Object.assign(cfg, { BUSINESS_NAME: 'לוטו מייקר בע״מ', BUSINESS_ID: '515123456' });
    expect(await issueMissingReceipts()).toEqual({ receipts: 1, credits: 0 });
  });

  it('outside production a missing detail is issued with a visible placeholder', async () => {
    Object.assign(cfg, { NODE_ENV: 'development', BUSINESS_NAME: '', BUSINESS_ID: '' });
    addOrder('o1', '10.00');
    const r = await issueReceiptForOrder('o1', NOW);
    expect(r).toMatchObject({
      businessName: MISSING_BUSINESS_DETAIL_PLACEHOLDER,
      businessId: MISSING_BUSINESS_DETAIL_PLACEHOLDER,
    });
    expect(renderReceiptHtml(r as any, other, null)).toContain(MISSING_BUSINESS_DETAIL_PLACEHOLDER);
  });
});

describe('unique conflicts', () => {
  it('a credit issue that loses the race on the ORIGINAL receipt rethrows instead of reporting success', async () => {
    addOrder('o1', '10.00', 'refunded');
    // A background issuer commits the original receipt while the credit transaction is creating it
    h.s.beforeCreate = (data) => {
      if (data.kind === 'receipt') {
        h.s.receipts.push({
          id: 'rcp_bg',
          orderId: 'o1',
          userId: 'u1',
          kind: 'receipt',
          number: '2026-000099',
          customerName: null,
          idLast4: null,
          feeAmount: new Decimal('10.00'),
          vatRate: new Decimal('0.18'),
          vatAmount: new Decimal('1.53'),
          netAmount: new Decimal('8.47'),
        });
      }
    };
    await expect(issueCreditReceiptForOrder('o1', NOW)).rejects.toMatchObject({ code: 'P2002' });
    expect(h.s.receipts.filter((r) => r.kind === 'credit')).toHaveLength(0);

    // The sweep's next attempt then issues the credit receipt
    const credit = await issueCreditReceiptForOrder('o1', NOW);
    expect(credit).toMatchObject({ kind: 'credit', originalReceiptId: 'rcp_bg' });
  });

  it('a conflict on the credit receipt itself answers with the existing credit', async () => {
    addOrder('o1', '10.00');
    await issueReceiptForOrder('o1', NOW);
    h.s.orders.get('o1').status = 'refunded';
    h.s.beforeCreate = (data) => {
      if (data.kind === 'credit') h.s.receipts.push({ id: 'rcp_other', orderId: 'o1', kind: 'credit', number: '2026-000098' });
    };
    await expect(issueCreditReceiptForOrder('o1', NOW)).resolves.toMatchObject({ id: 'rcp_other' });
  });

  it('a receipt conflict that leaves no receipt for the order is rethrown', async () => {
    addOrder('o1', '10.00');
    // e.g. a clash on the receipt number, not on (orderId, kind)
    h.s.beforeCreate = (data) => {
      h.s.receipts.push({ id: 'rcp_x', orderId: 'other', kind: 'receipt', number: data.number });
    };
    await expect(issueReceiptForOrder('o1', NOW)).rejects.toMatchObject({ code: 'P2002' });
  });
});
