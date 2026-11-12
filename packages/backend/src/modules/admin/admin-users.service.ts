import { fromZonedTime } from 'date-fns-tz';
import { TIMEZONE } from '@lotto-maker/shared';
import { prisma } from '../../prisma.js';
import { AppError } from '../../plugins/error-handler.js';
import { writeAuditLogTx } from '../../lib/audit-log.js';

// Back-office view of customers and of the audit log. Never selects idNumberEnc, idNumberHash or
// idNumberLegacy: only the last 4 digits of the ID leave the server.

const adminUserSelect = {
  id: true,
  phone: true,
  fullName: true,
  walletBalance: true,
  status: true,
  verifiedAdult: true,
  idLast4: true,
  createdAt: true,
} as const;

interface AdminUserRow {
  id: string;
  phone: string;
  fullName: string | null;
  walletBalance: { toFixed(n: number): string };
  status: string;
  verifiedAdult: boolean;
  idLast4: string | null;
  createdAt: Date;
}

function toAdminUser(u: AdminUserRow) {
  return {
    id: u.id,
    phone: u.phone,
    fullName: u.fullName,
    walletBalance: u.walletBalance.toFixed(2),
    status: u.status,
    verifiedAdult: u.verifiedAdult,
    idLast4: u.idLast4,
    createdAt: u.createdAt,
  };
}

export const USER_SEARCH_LIMIT = 20;
/** At least this many digits after +972, so a search cannot list every customer. */
const MIN_NATIONAL_DIGITS = 3;

/**
 * Normalises what an admin types into the +972 E.164 prefix stored in User.phone:
 * "050-123 4567" / "0501234567" / "972501234567" / "+972501234567" / "501234567" -> "+972501234567".
 * Returns null when there are not enough digits to search on.
 */
export function normalizePhoneQuery(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  let national: string;
  if (digits.startsWith('972')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  national = national.replace(/^0+/, '');
  if (national.length < MIN_NATIONAL_DIGITS || national.length > 9) return null;
  return `+972${national}`;
}

/** Exact or prefix match on the normalised phone, newest customers first, at most 20. */
export async function searchUsersByPhone(rawPhone: string) {
  const phone = normalizePhoneQuery(rawPhone);
  if (!phone) {
    throw new AppError(400, 'INVALID_PHONE_QUERY', `Give at least ${MIN_NATIONAL_DIGITS} digits of an Israeli phone number`);
  }
  const rows = await prisma.user.findMany({
    where: { phone: { startsWith: phone } },
    orderBy: { createdAt: 'desc' },
    take: USER_SEARCH_LIMIT,
    select: adminUserSelect,
  });
  return { query: phone, items: rows.map(toAdminUser) };
}

export async function getUserForAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');
  const [orders, walletTransactions] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, status: true, totalCharged: true, createdAt: true, draw: { select: { drawNumber: true } } },
    }),
    prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, amount: true, description: true, createdAt: true },
    }),
  ]);
  return {
    ...toAdminUser(user),
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: o.totalCharged.toFixed(2),
      // Null for pre-Phase-2 orders that have no Draw row
      drawNumber: o.draw?.drawNumber ?? null,
      createdAt: o.createdAt,
    })),
    walletTransactions: walletTransactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount.toFixed(2),
      description: t.description,
      createdAt: t.createdAt,
    })),
  };
}

/**
 * Suspends or reactivates a customer. Idempotent: setting the status the user already has changes
 * nothing, writes no audit entry and returns `changed: false`. A real change is audited with the reason.
 *
 * What `suspended` blocks (checked where each action happens): new orders, deposits (checkout),
 * withdrawals, and subscription runs. Login and read-only access stay open so the user can still see
 * their account and collect prizes.
 */
export async function setUserStatus(
  userId: string,
  adminId: string,
  status: 'active' | 'suspended',
  reason?: string,
) {
  const from = status === 'suspended' ? 'active' : 'suspended';
  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, status: from }, data: { status } });
    if (count === 0) return false;
    await writeAuditLogTx(tx, {
      entityType: 'user',
      entityId: userId,
      action: status === 'suspended' ? 'user:suspended' : 'user:unsuspended',
      actorId: adminId,
      actorType: 'admin',
      metadata: reason ? { reason } : undefined,
    });
    return true;
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: adminUserSelect });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND');
  return { ...toAdminUser(user), changed };
}

// ─── Audit log ───────────────────────────────────────────────────────────────

export const AUDIT_DEFAULT_PAGE_SIZE = 50;
export const AUDIT_MAX_PAGE_SIZE = 200;

/**
 * An ISO date-time with offset is taken as is. A bare date (YYYY-MM-DD) is a day in Israel time:
 * `from` is that day's start, `to` includes that whole day.
 */
export function auditBound(value: string, edge: 'from' | 'to'): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = fromZonedTime(`${value}T00:00:00`, TIMEZONE);
    if (Number.isNaN(start.getTime())) throw new AppError(400, 'INVALID_DATE', `${edge} is not a valid date`);
    if (edge === 'from') return start;
    const next = new Date(`${value}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return new Date(fromZonedTime(next.toISOString().slice(0, 10) + 'T00:00:00', TIMEZONE).getTime() - 1);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new AppError(400, 'INVALID_DATE', `${edge} is not a valid date`);
  return d;
}

export interface AuditQuery {
  action?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listAuditLog(q: AuditQuery) {
  const createdAt: { gte?: Date; lte?: Date } = {};
  if (q.from) createdAt.gte = auditBound(q.from, 'from');
  if (q.to) createdAt.lte = auditBound(q.to, 'to');
  const where = {
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.from || q.to ? { createdAt } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  // The admin's phone, for entries an admin made (actorId is the Admin id)
  const adminIds = [...new Set(rows.filter((r) => r.actorType === 'admin' && r.actorId).map((r) => r.actorId!))];
  const admins = adminIds.length
    ? await prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, phone: true, name: true } })
    : [];
  const byId = new Map(admins.map((a) => [a.id, a]));

  return {
    items: rows.map((r) => {
      const admin = r.actorType === 'admin' && r.actorId ? byId.get(r.actorId) : undefined;
      return {
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        orderId: r.orderId,
        actorType: r.actorType,
        actorId: r.actorId,
        adminPhone: admin?.phone ?? null,
        adminName: admin?.name ?? null,
        metadata: r.metadata,
        createdAt: r.createdAt,
      };
    }),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}
