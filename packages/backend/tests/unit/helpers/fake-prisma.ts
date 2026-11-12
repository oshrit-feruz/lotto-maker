import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Minimal in-memory stand-in for the Prisma client, covering only what the
 * payment / wallet code paths touch. `$transaction` runs the callback against
 * the same store (no rollback), which is enough for these unit tests.
 */
export function createFakePrisma() {
  const users = new Map<string, any>();
  const payments = new Map<string, any>();
  const walletTxs: any[] = [];
  const savedCards: any[] = [];
  const auditLogs: any[] = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;

  const findPayment = (where: any) =>
    [...payments.values()].find((p) =>
      Object.entries(where).every(([k, v]) => p[k] === v),
    ) ?? null;

  const client: any = {
    user: {
      findUnique: async ({ where }: any) => users.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const user = users.get(where.id);
        if (!user) throw new Error('user not found');
        if (data.walletBalance?.increment !== undefined) {
          user.walletBalance = new Decimal(user.walletBalance).plus(data.walletBalance.increment);
        }
        if (data.walletBalance?.decrement !== undefined) {
          user.walletBalance = new Decimal(user.walletBalance).minus(data.walletBalance.decrement);
        }
        if (data.status !== undefined) user.status = data.status;
        return user;
      },
    },
    payment: {
      findUnique: async ({ where }: any) => findPayment(where),
      create: async ({ data }: any) => {
        if (findPayment({ providerTxId: data.providerTxId }) || findPayment({ idempotencyKey: data.idempotencyKey })) {
          throw new Error('unique constraint violation');
        }
        const payment = {
          id: nextId('pay'),
          cardLast4: null,
          cardToken: null,
          createdAt: new Date(),
          ...data,
          amount: new Decimal(data.amount),
        };
        payments.set(payment.id, payment);
        return payment;
      },
      update: async ({ where, data }: any) => {
        const payment = payments.get(where.id);
        Object.assign(payment, data);
        return payment;
      },
      updateMany: async ({ where, data }: any) => {
        const payment = findPayment(where);
        if (!payment) return { count: 0 };
        Object.assign(payment, data);
        return { count: 1 };
      },
    },
    savedCard: {
      findFirst: async ({ where, orderBy }: any) => {
        const rows = savedCards.filter((c) => Object.entries(where).every(([k, v]) => c[k] === v));
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
        return rows[0] ?? null;
      },
      findUnique: async ({ where }: any) => savedCards.find((c) => c.id === where.id) ?? null,
      findMany: async ({ where, orderBy }: any) => {
        const rows = savedCards.filter((c) => Object.entries(where).every(([k, v]) => c[k] === v));
        if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
        return rows;
      },
      create: async ({ data }: any) => {
        const card = { id: nextId('card'), active: true, brand: null, createdAt: Date.now(), seq: ++seq, ...data };
        savedCards.push(card);
        return card;
      },
      update: async ({ where, data }: any) => {
        const card = savedCards.find((c) => c.id === where.id);
        Object.assign(card, data);
        return card;
      },
    },
    walletTransaction: {
      create: async ({ data }: any) => {
        if (data.paymentId && walletTxs.some((t) => t.paymentId === data.paymentId && t.type === data.type)) {
          throw new Error('unique constraint violation: paymentId');
        }
        const tx = { id: nextId('wtx'), ...data };
        walletTxs.push(tx);
        return tx;
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
    // Only used for: SELECT "walletBalance" FROM "User" WHERE id = $1 FOR UPDATE
    $queryRaw: async (_strings: TemplateStringsArray, userId: string) => {
      const user = users.get(userId);
      return user ? [{ walletBalance: new Decimal(user.walletBalance).toFixed(2) }] : [];
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(client),
  };

  return {
    client,
    users,
    payments,
    walletTxs,
    savedCards,
    auditLogs,
    addUser(id: string, walletBalance = 0) {
      users.set(id, { id, status: 'active', walletBalance: new Decimal(walletBalance) });
    },
    balanceOf: (id: string) => new Decimal(users.get(id).walletBalance).toNumber(),
  };
}
