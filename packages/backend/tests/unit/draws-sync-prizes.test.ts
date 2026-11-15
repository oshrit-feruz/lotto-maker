import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('../../src/prisma.js', () => ({
  prisma: { draw: { findUnique: db.findUnique, create: db.create, update: db.update } },
}));
const axiosGet = vi.hoisted(() => vi.fn());
vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, default: { ...actual.default, get: axiosGet } };
});
vi.mock('../../src/modules/results/settlement.service.js', () => ({ markDrawResultsDelayed: vi.fn() }));

import { syncUpcomingDraws } from '../../src/modules/draws/draws.sync.js';

const pais = (fields: Record<string, unknown> = {}) => ({
  data: [{ displayDate: '14/11/2026', displayTime: '22:45', LotteryNumber: 3984, firstPrize: 8000000, secondPrize: 750000, ...fields }],
});

beforeEach(() => vi.clearAllMocks());

describe('syncUpcomingDraws: announced prizes', () => {
  // Shape of a real pais response (15/11/2026): prizes are numbers in shekels, and secondPrize is
  // not the double-lotto prize, so only its raw text is stored.
  it('stores the first prize in shekels and secondPrize as raw text only', async () => {
    axiosGet.mockResolvedValue(pais());
    db.findUnique.mockResolvedValue(null);
    await syncUpcomingDraws();
    expect(db.create.mock.calls[0][0].data).toMatchObject({
      drawNumber: 3984,
      announcedFirstPrize: '8000000.00',
      announcedDoublePrize: null,
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
      announcedDoublePrize: null,
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
      announcedDoublePrize: null,
      announcedFirstPrizeRaw: '8000000',
      announcedDoublePrizeRaw: '750000',
    });
    await syncUpcomingDraws();
    expect(db.update).not.toHaveBeenCalled();
  });
});
