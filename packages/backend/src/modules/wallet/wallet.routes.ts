import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as walletService from './wallet.service.js';

const depositSchema = z.object({
  amount: z.number().positive().max(10000),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export default async function walletRoutes(app: FastifyInstance) {
  app.get('/wallet/balance', { preHandler: [app.authenticate] }, async (request, reply) => {
    const balance = await walletService.getBalance(request.user.sub);
    return reply.send({ balance: balance.toFixed(2) });
  });

  app.post('/wallet/deposit', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { amount } = depositSchema.parse(request.body);
    const result = await walletService.deposit(request.user.sub, amount, 'הפקדה לארנק');
    return reply.send({
      newBalance: result.newBalance.toFixed(2),
      transactionId: result.transactionId,
    });
  });

  app.get('/wallet/transactions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const result = await walletService.getTransactions(request.user.sub, page, limit);
    return reply.send(result);
  });
}
