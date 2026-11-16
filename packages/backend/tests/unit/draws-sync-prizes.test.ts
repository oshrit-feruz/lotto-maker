import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('../../src/prisma.js', () => ({
  prisma: { draw: { findUnique: db.findUnique, findMany: db.findMany, create: db.create, update: db.update } },
}));
const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, default: { ...actual.default, get: axiosGet } };
});
vi.mock('../../src/modules/results/settlement.service.js', () => ({ markDrawResultsDelayed: vi.fn() }));

import { fetchDueResults, syncUpcomingDraws } from '../../src/modules/draws/draws.sync.js';
import { SEED_DRAW_NUMBER_BASE } from '../../src/lib/seed-draws.js';

const pais = (fields: Record<string, unknown> = {}) => ({
  data: [{ displayDate: '14/11/2026', displayTime: '22:45', LotteryNumber: 3984, firstPrize: 8000000, secondPrize: 750000, ...fields }],
});

beforeEach(() => vi.clearAllMocks());

describe('syncUpcomingDraws: announced prizes', () => {
  // Shape of a real pais response (15/11/2026): prizes are numbers in shekels, and secondPrize is
  // not the double-lotto prize, so only its raw text is stored. The double prize is twice the first.
  it('stores the first prize in shekels, the double prize as twice it, and secondPrize as raw text', async () => {
    axiosGet.mockResolvedValue(pais());
    db.findUnique.mockResolvedValue(null);
    await syncUpcomingDraws();
    expect(db.create.mock.calls[0][0].data).toMatchObject({
      drawNumber: 3984,
      announcedFirstPrize: '8000000.00',
      announcedDoublePrize: '16000000.00',
      announcedFirstPrizeRaw: '8000000',
      announcedDoublePrizeRaw: '750000',
    });
  });

  it('updates a scheduled draw when only the announced prize changed', async () => {
    axiosGet.mockResolvedValue(pais({ firstPrize: 9000000 }));
    db.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'scheduled',
      salesCloseAt: new Date('2026-11-14T20:45:00Z'),
      drawAt: new Date('2026-11-14T21:00:00Z'),
      announcedFirstPrize: new Decimal('8000000'),
      announcedDoublePrize: new Decimal('16000000'),
    });
    await syncUpcomingDraws();
    expect(db.update.mock.calls[0][0].data).toMatchObject({ announcedFirstPrize: '9000000.00' });
  });

  it('writes nothing when nothing changed', async () => {
    axiosGet.mockResolvedValue(pais());
    db.findUnique.mockResolvedValue({
      id: 'd1',
      status: 'scheduled',
      salesCloseAt: new Date('2026-11-14T20:45:00Z'),
      drawAt: new Date('2026-11-14T21:00:00Z'),
      announcedFirstPrize: new Decimal('8000000'),
      announcedDoublePrize: new Decimal('16000000'),
      announcedFirstPrizeRaw: '8000000',
      announcedDoublePrizeRaw: '750000',
    });
    await syncUpcomingDraws();
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('fetchDueResults: dev-seed draws', () => {
  it('never asks pais for a draw numbered from SEED_DRAW_NUMBER_BASE up', async () => {
    const rows = [3984, SEED_DRAW_NUMBER_BASE, SEED_DRAW_NUMBER_BASE + 1].map((drawNumber) => ({
      id: `d${drawNumber}`,
      drawNumber,
      status: 'scheduled',
      drawAt: new Date('2026-11-14T20:45:00Z'),
    }));
    // Applies the drawNumber bound the job passes, as the database would
    db.findMany.mockImplementation(async ({ where }: any) =>
      rows.filter((r) => where.drawNumber?.lt === undefined || r.drawNumber < where.drawNumber.lt),
    );
    axiosGet.mockRejectedValue(new Error('offline'));
    await fetchDueResults(new Date('2026-11-16T00:00:00Z'));
    const asked = axiosGet.mock.calls.map(([url]) => String(url));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('lotteryId=3984');
  });
});
