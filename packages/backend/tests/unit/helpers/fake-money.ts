import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * In-memory stand-in for the Prisma client, covering the money-out code paths: users, saved cards,
 * withdrawals, card credits, prize claims, wallet transactions and the audit log. Generic table
 * helpers understand equality, `in`, `lt/lte/gt/gte`, `not`, and `{ increment }` updates.
 * `$transaction` runs against the same store (no rollback).
 */
export function createFakeMoney() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;

  const users = new Map<string, any>();
  const tables = {
    savedCard: [] as any[],
    withdrawal: [] as any[],
    pendingCardCredit: [] as any[],
    prizeClaim: [] as any[],
    walletTransaction: [] as any[],
    auditLog: [] as any[],
  };

  const fieldMatches = (value: any, cond: any): boolean => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !(cond instanceof Decimal)) {
      if ('in' in cond && !cond.in.includes(value)) return false;
      if ('not' in cond && value === cond.not) return false;
      if ('lt' in cond && !(value !== null && value !== undefined && value < cond.lt)) return false;
      if ('lte' in cond && !(value !== null && value !== undefined && value <= cond.lte)) return false;
      if ('gt' in cond && !(value !== null && value !== undefined && value > cond.gt)) return false;
      if ('gte' in cond && !(value !== null && value !== undefined && value >= cond.gte)) return false;
      return true;
    }
    return value === cond;
  };
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([k, v]) => fieldMatches(row[k], v));

  const applyData = (row: any, data: any) => {
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && !(v instanceof Date) && 'increment' in (v as any)) {
        row[k] = (row[k] ?? 0) + (v as any).increment;
      } else {
        row[k] = v;
      }
    }
  };

  const table = (name: keyof typeof tables, defaults: () => any, unique: Array<string[]> = []) => ({
    findUnique: async ({ where, include }: any) => {
      const row = tables[name].find((r) => matches(r, where)) ?? null;
      return row && include ? withIncludes(row, include) : row;
    },
    findFirst: async ({ where, orderBy }: any = {}) => {
      const rows = tables[name].filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'desc') rows.sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
      return rows[0] ?? null;
    },
    findMany: async ({ where, orderBy, take, include }: any = {}) => {
      let rows = tables[name].filter((r) => matches(r, where));
      if (orderBy?.createdAt === 'desc') rows = [...rows].sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
      if (take) rows = rows.slice(0, take);
      return include ? rows.map((r) => withIncludes(r, include)) : rows;
    },
    create: async ({ data }: any) => {
      for (const keys of unique) {
        if (keys.every((k) => data[k] !== undefined && data[k] !== null) &&
            tables[name].some((r) => keys.every((k) => r[k] === data[k]))) {
          throw new Error(`unique constraint violation: ${name} ${keys.join(',')}`);
        }
      }
      const row = { id: nextId(name), createdAt: Date.now(), seq: ++seq, ...defaults(), ...data };
      tables[name].push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = tables[name].find((r) => matches(r, where));
      if (!row) throw new Error(`${name} not found`);
      applyData(row, data);
      return row;
    },
    updateMany: async ({ where, data }: any) => {
      const hit = tables[name].filter((r) => matches(r, where));
      hit.forEach((r) => applyData(r, data));
      return { count: hit.length };
    },
  });

  const withIncludes = (row: any, include: any) => {
    const out = { ...row };
    if (include.savedCard) out.savedCard = tables.savedCard.find((c) => c.id === row.savedCardId) ?? null;
    if (include.user) out.user = users.get(row.userId) ?? null;
    return out;
  };

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
    savedCard: table('savedCard', () => ({ active: true, brand: null })),
    withdrawal: table('withdrawal', () => ({
      status: 'requested', fee: 0, savedCardId: null, bankDetailsEnc: null, bankAccountLast4: null,
      bankReference: null, providerTxId: null, adminId: null, decidedAt: null, paidAt: null, failureReason: null,
    })),
    pendingCardCredit: table('pendingCardCredit', () => ({
      status: 'pending', attempts: 0, nextAttemptAt: new Date(0), lastError: null, providerTxId: null,
      paidAt: null, paidByAdminId: null, manualReference: null,
    })),
    prizeClaim: table('prizeClaim', () => ({
      status: 'awaiting_pickup', scheduledAt: null, collectedAt: null, collectedByAdminId: null,
      idCheckedLast4: null, reminderSentAt: null,
    })),
    walletTransaction: table('walletTransaction', () => ({ withdrawalId: null, paymentId: null }), [
      ['withdrawalId', 'type'],
    ]),
    auditLog: table('auditLog', () => ({})),
    // Only used for: SELECT ... FROM "User" WHERE id = ${userId} FOR UPDATE
    $queryRaw: async (_strings: TemplateStringsArray, userId: string) => {
      const user = users.get(userId);
      return user ? [{ walletBalance: new Decimal(user.walletBalance).toFixed(2) }] : [];
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(client),
  };

  return {
    client,
    users,
    ...tables,
    addUser(id: string, fields: Record<string, any> = {}) {
      const { walletBalance = 0, ...rest } = fields;
      users.set(id, { id, status: 'active', verifiedAdult: false, fullName: null, idLast4: null, ...rest, walletBalance: new Decimal(walletBalance) });
    },
    addCard(userId: string, token = `tok_${userId}`, last4 = '4242') {
      const row = { id: nextId('card'), userId, token, last4, brand: 'visa', active: true, createdAt: Date.now(), seq: ++seq };
      tables.savedCard.push(row);
      return row;
    },
    balanceOf: (id: string) => new Decimal(users.get(id).walletBalance).toNumber(),
    reset() {
      users.clear();
      Object.values(tables).forEach((t) => (t.length = 0));
    },
    auditActions: () => tables.auditLog.map((a) => a.action),
  };
}
