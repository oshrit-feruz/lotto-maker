import { describe, it, expect, vi, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn() }));
vi.mock('../../src/prisma.js', () => ({ prisma: { draw: { findUnique: db.findUnique, create: db.create } } }));
const pais = vi.hoisted(() => ({ next: vi.fn(), draw: vi.fn() }));
vi.mock('../../src/modules/draws/draws.sync.js', () => ({
  fetchNextLotteryInfo: pais.next,
  fetchLottoDraw: pais.draw,
}));
const audit = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/audit-log.js', () => ({ writeAuditLog: audit }));

import { backfillPastDraws, drawAtFromDate } from '../../src/modules/draws/draws.backfill.js';

const NOW = new Date('2026-11-25T10:00:00Z');
const noSleep = () => Promise.resolve();
// Draw n took place (3989 - n) * 3.5 days before 28/11/2026, close enough for the window tests
const dateOf = (n: number) => {
  const d = new Date(Date.UTC(2026, 10, 28) - (3989 - n) * 3.5 * 86_400_000);
  return d.toISOString().slice(0, 10);
};
const parsed = (n: number) => ({
  drawNumber: n,
  drawDate: dateOf(n),
  numbers: [1, 2, 3, 4, 5, 6],
  strong: 7,
  extraDigits: [1, 2, 3, 4, 5, 6],
  prizeTiers: [{ game: 'lotto', tier: '6+s', winnersCount: 0, prizeAmount: '0.00' }],
});

beforeEach(() => {
  vi.clearAllMocks();
  pais.next.mockResolvedValue({ drawNumber: 3989 });
  pais.draw.mockImplementation(async (n: number) => parsed(n));
  db.create.mockResolvedValue({});
});

describe('backfillPastDraws', () => {
  it('imports past draws as settled, newest first, and stops at the first one older than ~2 months', async () => {
    db.findUnique.mockResolvedValue(null);
    const res = await backfillPastDraws(NOW, noSleep);

    // Window starts 25/09 10:00 UTC. 3971 is 26/09 (inside); 3970 is 22/09, the first outside
    expect(res.imported[0]).toBe(3988);
    expect(res.imported.at(-1)).toBe(3971);
    expect(res.imported).toHaveLength(18);
    expect(pais.draw).toHaveBeenLastCalledWith(3970);

    const data = db.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ drawNumber: 3988, status: 'settled', numbers: [1, 2, 3, 4, 5, 6], strong: 7 });
    expect(data.prizeTiers.create).toHaveLength(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'draw:history_imported' }));
  });

  it('skips stored draws without a request and stops at a stored draw outside the window', async () => {
    db.findUnique.mockImplementation(async ({ where }: any) =>
      where.drawNumber >= 3986
        ? { drawAt: drawAtFromDate(dateOf(where.drawNumber)) }
        : where.drawNumber === 3985
          ? null
          : { drawAt: new Date('2026-01-01T00:00:00Z') },
    );
    const res = await backfillPastDraws(NOW, noSleep);
    expect(res).toEqual({ imported: [3985], skipped: 3, failed: [] });
    expect(pais.draw).toHaveBeenCalledTimes(1);
  });

  it('keeps going past a draw Pais fails on, and writes no audit entry when nothing was imported', async () => {
    db.findUnique.mockImplementation(async ({ where }: any) =>
      where.drawNumber >= 3987 ? null : { drawAt: new Date('2026-01-01T00:00:00Z') },
    );
    pais.draw.mockRejectedValue(new Error('no response'));
    const res = await backfillPastDraws(NOW, noSleep);
    expect(res).toEqual({ imported: [], skipped: 0, failed: [3988, 3987] });
    expect(audit).not.toHaveBeenCalled();
  });

  it('treats a unique-constraint race as already imported', async () => {
    db.findUnique.mockImplementation(async ({ where }: any) =>
      where.drawNumber === 3988 ? null : { drawAt: new Date('2026-01-01T00:00:00Z') },
    );
    db.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    const res = await backfillPastDraws(NOW, noSleep);
    expect(res.imported).toEqual([]);
  });

  it('places the draw at 23:00 Israel time', () => {
    expect(drawAtFromDate('2026-11-24').toISOString()).toBe('2026-11-24T21:00:00.000Z');
    expect(drawAtFromDate('2026-07-14').toISOString()).toBe('2026-07-14T20:00:00.000Z');
  });
});
