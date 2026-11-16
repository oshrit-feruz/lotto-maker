/**
 * Local development seed. Safe to run any number of times: every step looks for what it would
 * create first and leaves existing rows alone.
 *
 *   npm run db:seed -w packages/backend      (also run by `prisma migrate reset` / `migrate dev`)
 *
 * Creates:
 *  - an Admin for SEED_ADMIN_PHONE (skipped with a log line when unset). Admin and operator roles
 *    are decided at OTP login by looking the phone up in the Admin, then the Operator table
 *    (src/modules/auth/auth.service.ts), so logging in with this phone gives an admin token.
 *  - one active Location (the same default the startup seed uses, src/lib/startup-seed.ts)
 *  - one Operator at that location, with SEED_OPERATOR_PHONE when set (needed to log in)
 *  - an open Lotto draw for the next Tue/Sat 22:45 Asia/Jerusalem, sales closing 2h before,
 *    unless an open draw already exists (e.g. one synced from pais.co.il)
 *
 * Phones are E.164 (+9725XXXXXXXX), the format POST /auth/otp/send accepts. Never commit a real one.
 * Refuses to run when NODE_ENV=production.
 */
import { PrismaClient } from '@prisma/client';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { DRAW_DAY_TO_JS, TIMEZONE } from '@lotto-maker/shared';
import type { DrawDay } from '@lotto-maker/shared';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed] NODE_ENV=production: the dev seed never runs against production. Aborting.');
  process.exit(1);
}

const prisma = new PrismaClient();

const E164 = /^\+\d{10,15}$/;
const MINUTE = 60_000;

const DRAW_DAYS: DrawDay[] = ['tue', 'sat'];
const DRAW_HOUR = 22;
const DRAW_MINUTE = 45;
const SALES_CLOSE_MINUTES_BEFORE = 120;
// Same default as config.ORDER_CLOSE_BUFFER_MINUTES: orders stop this long before salesCloseAt.
const ORDER_CLOSE_BUFFER_MINUTES = Number(process.env.ORDER_CLOSE_BUFFER_MINUTES ?? 30);
// Seeded draws get numbers in this range so they never look like a real pais draw number.
const DEV_DRAW_NUMBER_BASE = 900_000;

const DEFAULT_LOCATION = {
  name: 'סניף ראשי',
  address: 'ישראל',
  maxConcurrentOperators: 5,
  activeHours: { start: '08:00', end: '20:00' },
};
const DEV_OPERATOR_NAME = 'אופרטור פיתוח';

function phoneFromEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  if (!E164.test(value)) {
    throw new Error(`${name} must be E.164, e.g. +972501234567 (got "${value}")`);
  }
  return value;
}

/** Next Tue/Sat 22:45 Jerusalem time whose sales are still open (after the order buffer). */
export function nextDevDraw(from: Date = new Date()): { drawAt: Date; salesCloseAt: Date } {
  const nowInTz = toZonedTime(from, TIMEZONE);
  for (let daysAhead = 0; daysAhead <= 14; daysAhead++) {
    const day = new Date(nowInTz.getFullYear(), nowInTz.getMonth(), nowInTz.getDate() + daysAhead);
    if (!DRAW_DAYS.some((d) => DRAW_DAY_TO_JS[d] === day.getDay())) continue;
    day.setHours(DRAW_HOUR, DRAW_MINUTE, 0, 0);
    const drawAt = fromZonedTime(day, TIMEZONE);
    const salesCloseAt = new Date(drawAt.getTime() - SALES_CLOSE_MINUTES_BEFORE * MINUTE);
    if (salesCloseAt.getTime() - ORDER_CLOSE_BUFFER_MINUTES * MINUTE > from.getTime()) {
      return { drawAt, salesCloseAt };
    }
  }
  throw new Error('no upcoming draw day found');
}

async function seedAdmin() {
  const phone = phoneFromEnv('SEED_ADMIN_PHONE');
  if (!phone) {
    console.log('[seed] SEED_ADMIN_PHONE is not set: no admin created (set it in .env to log in to the admin dashboard)');
    return;
  }
  const existing = await prisma.admin.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.active) await prisma.admin.update({ where: { id: existing.id }, data: { active: true } });
    console.log(`[seed] admin ${phone} already exists`);
    return;
  }
  const admin = await prisma.admin.create({ data: { name: 'מנהל פיתוח', phone } });
  console.log(`[seed] created admin ${admin.id} (${phone})`);
}

async function seedLocation() {
  const existing = await prisma.location.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  if (existing) {
    console.log(`[seed] location "${existing.name}" already exists`);
    return existing;
  }
  const location = await prisma.location.create({ data: { ...DEFAULT_LOCATION, active: true } });
  console.log(`[seed] created location ${location.id}`);
  return location;
}

async function seedOperator(locationId: string) {
  const phone = phoneFromEnv('SEED_OPERATOR_PHONE');
  if (phone) {
    const byPhone = await prisma.operator.findUnique({ where: { phone } });
    if (byPhone) {
      console.log(`[seed] operator ${phone} already exists`);
      return;
    }
  }
  // An operator created earlier by this seed (without a phone, or with another one)
  const own = await prisma.operator.findFirst({ where: { name: DEV_OPERATOR_NAME, locationId } });
  if (own) {
    if (phone && own.phone !== phone) {
      await prisma.operator.update({ where: { id: own.id }, data: { phone } });
      console.log(`[seed] set phone of dev operator ${own.id} to ${phone}`);
    } else {
      console.log('[seed] dev operator already exists');
    }
    return;
  }
  const op = await prisma.operator.create({
    data: { name: DEV_OPERATOR_NAME, phone, locationId, active: true, throughputPerHour: 50 },
  });
  console.log(
    phone
      ? `[seed] created operator ${op.id} (${phone})`
      : `[seed] created operator ${op.id} without a phone (set SEED_OPERATOR_PHONE and re-run to log in as it)`,
  );
}

async function seedDraw() {
  const now = new Date();
  // Same rule as getOpenDraws (src/lib/draws.ts): scheduled and still taking orders
  const open = await prisma.draw.findFirst({
    where: { status: 'scheduled', salesCloseAt: { gt: new Date(now.getTime() + ORDER_CLOSE_BUFFER_MINUTES * MINUTE) } },
    orderBy: { drawAt: 'asc' },
  });
  if (open) {
    console.log(`[seed] open draw #${open.drawNumber} at ${open.drawAt.toISOString()} already exists`);
    return;
  }
  const { drawAt, salesCloseAt } = nextDevDraw(now);
  const last = await prisma.draw.findFirst({
    where: { drawNumber: { gt: DEV_DRAW_NUMBER_BASE } },
    orderBy: { drawNumber: 'desc' },
  });
  const drawNumber = (last?.drawNumber ?? DEV_DRAW_NUMBER_BASE) + 1;
  const draw = await prisma.draw.create({ data: { drawNumber, drawAt, salesCloseAt } });
  console.log(`[seed] created draw #${draw.drawNumber}: draw ${drawAt.toISOString()}, sales close ${salesCloseAt.toISOString()}`);
}

async function main() {
  await seedAdmin();
  const location = await seedLocation();
  await seedOperator(location.id);
  await seedDraw();
  console.log('[seed] done');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
