import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as walletService from './wallet.service.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function walletRoutes(app: FastifyInstance) {
  app.get('/wallet/balance', { preHandler: [app.authenticate] }, async (request, reply) => {
    const balance = await walletService.getBalance(request.user.sub);
    return reply.send({ balance: balance.toFixed(2) });
  });

  // There is deliberately no deposit route: the wallet is credited only by a
  // provider-confirmed payment (see modules/payments).

  app.get('/wallet/transactions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const result = await walletService.getTransactions(request.user.sub, page, limit);
    return reply.send(result);
  });
}
