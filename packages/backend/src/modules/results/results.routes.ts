import type { FastifyInstance } from 'fastify';
import { fetchDrawResults } from './results.service.js';
import type { GameType } from '@lotto-maker/shared';

export default async function resultsRoutes(app: FastifyInstance) {
  app.get('/results/:gameType/:drawDate', async (request, reply) => {
    const { gameType, drawDate } = request.params as { gameType: string; drawDate: string };
    const validGames = ['lotto', 'chance', 'seven77', 'one23'];
    if (!validGames.includes(gameType)) {
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

    return reply.send({ ...result, source: 'pais_api' });
  });
}
