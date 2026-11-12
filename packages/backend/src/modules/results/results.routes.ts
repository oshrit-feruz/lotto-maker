import type { FastifyInstance } from 'fastify';
import { fetchDrawResults } from './results.service.js';
import { resultsScraper, ScraperNetworkError, ScraperValidationError } from '../../services/results-scraper.js';
import { getNextDrawInfo } from '../../lib/draw-schedule.js';
import type { GameType } from '@lotto-maker/shared';
import { cutoffsOf, getOpenDraws } from '../../lib/draws.js';
import { isGameEnabled } from '../../lib/games.js';
import { z } from 'zod';
import {
  findLatestResult,
  getActivePrices,
  getLatestResult,
  getNextDraw,
  getResultByDrawNumber,
} from './public.service.js';

const VALID_GAMES = ['lotto', 'chance', 'seven77', 'one23'] as const;

export default async function resultsRoutes(app: FastifyInstance) {
  // Latest result for a game (no date required — always returns the most recent draw)
  app.get('/results/:gameType/latest', async (request, reply) => {
    const { gameType } = request.params as { gameType: string };
    if (!VALID_GAMES.includes(gameType as GameType)) {
      return reply.status(400).send({ error: 'INVALID_GAME_TYPE' });
    }

    // Lotto: the latest admin-confirmed draw from our DB, with its prize tables. Same shape as
    // GET /results/latest. Before the first confirmed draw, falls back to the scraper below.
    if (gameType === 'lotto') {
      const confirmed = await findLatestResult();
      if (confirmed) return reply.send(confirmed);
    }

    try {
      const result = await resultsScraper.fetchLatestResult(gameType as GameType);
      return reply.send({
        prizeTiers: [],
        drawNumber: result.drawNumber,
        gameType: result.gameType,
        winningNumbers: result.winningNumbers,
        strongNumber: result.strongNumber ?? null,
        drawDate: result.drawDate.toISOString(),
      });
    } catch (err) {
      if (err instanceof ScraperValidationError) {
        return reply.status(422).send({ error: 'RESULTS_UNSUPPORTED' });
      }
      return reply.status(503).send({ error: 'RESULTS_UNAVAILABLE' });
    }
  });

  // Confirmed lotto results (public). Only draws an admin confirmed (results_confirmed / settled).
  app.get('/results/latest', async (request, reply) => {
    z.object({ game: z.literal('lotto').default('lotto') }).parse(request.query);
    return reply.send(await getLatestResult());
  });

  app.get('/results/:drawNumber', async (request, reply) => {
    const { drawNumber } = z
      .object({ drawNumber: z.coerce.number().int().positive().max(1_000_000) })
      .parse(request.params);
    return reply.send(await getResultByDrawNumber(drawNumber));
  });

  // The next lotto draw open for orders, with the announced prizes (public)
  app.get('/draws/next', async (_request, reply) => {
    return reply.send(await getNextDraw());
  });

  // Active price list for the logged-out price calculator (public)
  app.get('/prices', async (_request, reply) => {
    return reply.header('Cache-Control', 'public, max-age=300').send(await getActivePrices());
  });

  // Upcoming draw times and cutoffs for all games (public, no auth)
  app.get('/draws/upcoming', async (_request, reply) => {
    const now = new Date();
    const upcoming = [];
    for (const gameType of VALID_GAMES) {
      if (!isGameEnabled(gameType)) continue;
      if (gameType === 'lotto') {
        // Lotto draws and cutoffs come from the Draw table (synced from pais.co.il)
        for (const draw of await getOpenDraws(3, now)) {
          upcoming.push({
            gameType,
            drawNumber: draw.drawNumber,
            drawTime: draw.drawAt.toISOString(),
            salesCloseAt: draw.salesCloseAt.toISOString(),
            hardCutoff: cutoffsOf(draw).hardCutoff.toISOString(),
          });
        }
        continue;
      }
      const { drawTime, hardCutoff } = getNextDrawInfo(gameType, now);
      upcoming.push({
        gameType,
        drawTime: drawTime.toISOString(),
        hardCutoff: hardCutoff.toISOString(),
      });
    }
    return reply.send(upcoming);
  });

  // Result for a specific draw date
  app.get('/results/:gameType/:drawDate', async (request, reply) => {
    const { gameType, drawDate } = request.params as { gameType: string; drawDate: string };
    if (!VALID_GAMES.includes(gameType as GameType)) {
      return reply.status(400).send({ error: 'INVALID_GAME_TYPE' });
    }

    const date = new Date(drawDate);
    if (isNaN(date.getTime())) {
      return reply.status(400).send({ error: 'INVALID_DATE' });
    }

    const result = await fetchDrawResults(gameType as GameType, date);
    if (!result) {
      return reply.status(404).send({ error: 'RESULTS_NOT_AVAILABLE' });
    }

    return reply.send({ ...result, drawDate: result.drawDate.toISOString() });
  });
}
