import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Decimal } from 'decimal.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const db = vi.hoisted(() => ({
  drawFindMany: vi.fn(),
  drawFindFirst: vi.fn(),
  drawFindUnique: vi.fn(),
  priceFindFirst: vi.fn(),
}));
vi.mock('../../src/prisma.js', () => ({
  prisma: {
    draw: { findMany: db.drawFindMany, findFirst: db.drawFindFirst, findUnique: db.drawFindUnique },
    priceList: { findFirst: db.priceFindFirst },
  },
}));

const scraper = vi.hoisted(() => ({ fetchLatestResult: vi.fn() }));
vi.mock('../../src/services/results-scraper.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/results-scraper.js')>();
  return { ...actual, resultsScraper: scraper };
});

import errorHandler from '../../src/plugins/error-handler.js';
import resultsRoutes from '../../src/modules/results/results.routes.js';
import { config } from '../../src/config.js';

let app: FastifyInstance;
const MIN = 60_000;

const scheduledDraw = (fields: Record<string, unknown> = {}) => ({
  id: 'draw-3984',
  drawNumber: 3984,
  drawAt: new Date('2026-11-14T21:00:00Z'),
  salesCloseAt: new Date('2026-11-14T20:45:00Z'),
  status: 'scheduled',
  announcedFirstPrize: new Decimal('5000000'),
  announcedDoublePrize: new Decimal('10000000'),
  ...fields,
});

const tier = (game: string, t: string, winnersCount: number, amount: string) => ({
  game, tier: t, winnersCount, prizeAmount: new Decimal(amount),
});
const confirmedDraw = (fields: Record<string, unknown> = {}) => ({
  id: 'draw-3983',
  drawNumber: 3983,
  drawAt: new Date('2026-11-10T21:00:00Z'),
  status: 'results_confirmed',
  confirmedAt: new Date('2026-11-10T23:00:00Z'),
  numbers: [3, 11, 17, 22, 30, 36],
  strong: 5,
  extraDigits: [1, 2, 3, 4, 5, 6],
  // Deliberately out of order: the response sorts them
  prizeTiers: [
    tier('extra', '2', 1000, '10'),
    tier('double', '6+s', 0, '0'),
    tier('lotto', '3', 5000, '10'),
    tier('lotto', '6+s', 0, '0'),
    tier('extra', '6', 0, '0'),
  ],
  ...fields,
});

beforeEach(async () => {
  vi.clearAllMocks();
  app = Fastify();
  await app.register(errorHandler);
  await app.register(resultsRoutes);
  await app.ready();
});
afterEach(() => app.close());

describe('GET /draws/next', () => {
  it('returns the next open draw with the announced prizes', async () => {
    db.drawFindMany.mockResolvedValue([scheduledDraw()]);
    const res = await app.inject({ method: 'GET', url: '/draws/next' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id: 'draw-3984',
      gameType: 'lotto',
      drawNumber: 3984,
      drawAt: '2026-11-14T21:00:00.000Z',
      salesCloseAt: '2026-11-14T20:45:00.000Z',
      firstPrize: '5000000.00',
      doublePrize: '10000000.00',
    });
    expect(new Date(body.hardCutoff).getTime()).toBe(
      new Date('2026-11-14T20:45:00Z').getTime() - config.ORDER_CLOSE_BUFFER_MINUTES * MIN,
    );
    // Same query as /draws/upcoming: scheduled draws whose sales are still open, soonest first
    expect(db.drawFindMany.mock.calls[0][0]).toMatchObject({ where: { status: 'scheduled' }, orderBy: { drawAt: 'asc' }, take: 1 });
  });

  it('returns null prizes when none were announced', async () => {
    db.drawFindMany.mockResolvedValue([scheduledDraw({ announcedFirstPrize: null, announcedDoublePrize: null })]);
    const body = (await app.inject({ method: 'GET', url: '/draws/next' })).json();
    expect(body.firstPrize).toBeNull();
    expect(body.doublePrize).toBeNull();
  });

  it('404 NO_OPEN_DRAW when nothing is open', async () => {
    db.drawFindMany.mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: '/draws/next' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NO_OPEN_DRAW');
  });

  it('leaves /draws/upcoming working', async () => {
    db.drawFindMany.mockResolvedValue([scheduledDraw()]);
    const res = await app.inject({ method: 'GET', url: '/draws/upcoming' });
    expect(res.statusCode).toBe(200);
    expect(res.json()[0]).toMatchObject({ gameType: 'lotto', drawNumber: 3984 });
  });
});

describe('GET /results/latest and /results/:drawNumber', () => {
  it('returns the latest confirmed draw with the three prize tables', async () => {
    db.drawFindFirst.mockResolvedValue(confirmedDraw());
    const res = await app.inject({ method: 'GET', url: '/results/latest?game=lotto' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      drawNumber: 3983,
      numbers: [3, 11, 17, 22, 30, 36],
      strong: 5,
      extraDigits: [1, 2, 3, 4, 5, 6],
      status: 'results_confirmed',
      winningNumbers: [3, 11, 17, 22, 30, 36],
      strongNumber: 5,
    });
    expect(body.prizeTiers.map((t: any) => `${t.game}:${t.tier}`)).toEqual([
      'lotto:6+s', 'lotto:3', 'double:6+s', 'extra:6', 'extra:2',
    ]);
    expect(body.prizeTiers[1]).toEqual({ game: 'lotto', tier: '3', winnersCount: 5000, prizeAmount: '10.00' });
    expect(body.prizes.lotto).toHaveLength(2);
    expect(body.prizes.double).toEqual([{ tier: '6+s', winnersCount: 0, prizeAmount: '0.00' }]);
    expect(body.prizes.extra).toHaveLength(2);
    // Only confirmed or settled draws are public
    expect(db.drawFindFirst.mock.calls[0][0].where).toEqual({ status: { in: ['results_confirmed', 'settled'] } });
  });

  it('defaults game to lotto and refuses other games', async () => {
    db.drawFindFirst.mockResolvedValue(confirmedDraw());
    expect((await app.inject({ method: 'GET', url: '/results/latest' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/results/latest?game=chance' })).statusCode).toBe(400);
  });

  it('404 when there is no confirmed draw yet', async () => {
    db.drawFindFirst.mockResolvedValue(null);
    const res = await app.inject({ method: 'GET', url: '/results/latest' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('RESULTS_NOT_AVAILABLE');
  });

  it('returns a settled draw by number', async () => {
    db.drawFindUnique.mockResolvedValue(confirmedDraw({ status: 'settled' }));
    const res = await app.inject({ method: 'GET', url: '/results/3983' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('settled');
    expect(db.drawFindUnique.mock.calls[0][0].where).toEqual({ drawNumber: 3983 });
  });

  it.each(['scheduled', 'results_suggested'])('hides a %s draw (404)', async (status) => {
    db.drawFindUnique.mockResolvedValue(confirmedDraw({ status }));
    const res = await app.inject({ method: 'GET', url: '/results/3983' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('RESULTS_NOT_AVAILABLE');
  });

  it('rejects a non-numeric draw number', async () => {
    expect((await app.inject({ method: 'GET', url: '/results/abc' })).statusCode).toBe(400);
  });
});

describe('GET /results/lotto/latest (existing route, used by the web and mobile)', () => {
  it('returns the latest confirmed draw with prizeTiers when there is one', async () => {
    db.drawFindFirst.mockResolvedValue(confirmedDraw());
    const res = await app.inject({ method: 'GET', url: '/results/lotto/latest' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ drawNumber: 3983, winningNumbers: [3, 11, 17, 22, 30, 36], strongNumber: 5 });
    expect(res.json().prizeTiers).toHaveLength(5);
    expect(scraper.fetchLatestResult).not.toHaveBeenCalled();
  });

  it('falls back to the scraper (with empty prizeTiers) before any draw is confirmed', async () => {
    db.drawFindFirst.mockResolvedValue(null);
    scraper.fetchLatestResult.mockResolvedValue({
      drawNumber: 3983, gameType: 'lotto', winningNumbers: [1, 2, 3, 4, 5, 6], strongNumber: 1, drawDate: new Date('2026-11-10T21:00:00Z'),
    });
    const res = await app.inject({ method: 'GET', url: '/results/lotto/latest' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ drawNumber: 3983, winningNumbers: [1, 2, 3, 4, 5, 6], prizeTiers: [] });
  });
});

describe('GET /prices', () => {
  it('returns the active regular and double price rows', async () => {
    db.priceFindFirst.mockImplementation(async ({ where }: any) =>
      where.ticketType === 'regular'
        ? { pricePerTable: new Decimal('3'), extraPricePerForm: new Decimal('5'), feePerOrder: new Decimal('4.9'), effectiveFrom: new Date('2026-01-01T00:00:00Z') }
        : { pricePerTable: new Decimal('6'), extraPricePerForm: null, feePerOrder: new Decimal('4.9'), effectiveFrom: new Date('2026-01-01T00:00:00Z') },
    );
    const res = await app.inject({ method: 'GET', url: '/prices' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      currency: 'ILS',
      regular: { pricePerTable: '3.00', extraPricePerForm: '5.00', feePerOrder: '4.90', effectiveFrom: '2026-01-01T00:00:00.000Z' },
      double: { pricePerTable: '6.00', extraPricePerForm: null, feePerOrder: '4.90', effectiveFrom: '2026-01-01T00:00:00.000Z' },
    });
    // The row in force: latest effectiveFrom not after now
    const q = db.priceFindFirst.mock.calls[0][0];
    expect(q.orderBy).toEqual({ effectiveFrom: 'desc' });
    expect(q.where.effectiveFrom.lte).toBeInstanceOf(Date);
  });

  it('returns null for a ticket type with no price row', async () => {
    db.priceFindFirst.mockResolvedValue(null);
    expect((await app.inject({ method: 'GET', url: '/prices' })).json()).toEqual({ currency: 'ILS', regular: null, double: null });
  });
});
