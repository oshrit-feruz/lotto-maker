import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertGameEnabled } from '../../lib/games.js';
import {
  calculateTicket,
  checkDuplicate,
  generateLottomatTables,
  ticketBodySchema,
} from './tickets.service.js';

const lottomatSchema = z.object({
  type: z.enum(['regular', 'double']),
  tableCount: z.number().int().min(2).max(14),
});

export default async function ticketsRoutes(app: FastifyInstance) {
  // Price breakdown (Pais price, our fee, total) before payment
  app.post('/tickets/calculate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = ticketBodySchema.parse(request.body);
    return reply.send(await calculateTicket(body));
  });

  // Warns when the user already has the same combination in the same draw
  app.post('/tickets/check-duplicate', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = ticketBodySchema.parse(request.body);
    return reply.send(await checkDuplicate(request.user.sub, body));
  });

  // Lottomat: the server picks the numbers
  app.post('/tickets/lottomat', { preHandler: [app.authenticate] }, async (request, reply) => {
    assertGameEnabled('lotto');
    const { type, tableCount } = lottomatSchema.parse(request.body);
    return reply.send({ tables: generateLottomatTables(type, tableCount) });
  });
}
