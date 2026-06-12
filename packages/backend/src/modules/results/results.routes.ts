import type { FastifyInstance } from 'fastify';
import { fetchDrawResults } from './results.service.js';
import { resultsScraper, ScraperNetworkError, ScraperValidationError } from '../../services/results-scraper.js';
import { getNextDrawInfo } from '../../lib/draw-schedule.js';
import type { GameType } from '@lotto-maker/shared';

const VALID_GAMES = ['lotto', 'chance', 'seven77', 'one23'] as const;

export default async function resultsRoutes(app: FastifyInstance) {
  // Latest result for a game (no date required — always returns the most recent draw)
  app.get('/results/:gameType/latest', async (request, reply) => {
    const { gameType } = request.params as { gameType: string };
    if (!VALID_GAMES.includes(gameType as GameType)) {
      return reply.status(400).send({ error: 'INVALID_GAME_TYPE' });
    }

    try {
      const result = await resultsScraper.fetchLatestResult(gameType as GameType);
      return reply.send({
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

  // Upcoming draw times and cutoffs for all games (public, no auth)
  app.get('/draws/upcoming', async (_request, reply) => {
    const now = new Date();
    const upcoming = VALID_GAMES.map((gameType) => {
      const { drawTime, hardCutoff } = getNextDrawInfo(gameType, now);
      return {
        gameType,
        drawTime: drawTime.toISOString(),
        hardCutoff: hardCutoff.toISOString(),
      };
    });
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
