import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as walletService from './wallet.service.js';
import { cancelWithdrawal, createWithdrawal, listUserWithdrawals } from './withdrawals.service.js';

const withdrawalSchema = z.object({
  amount: z
    .number()
    .positive()
    .max(100000)
    .refine((a) => Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, 'At most 2 decimal places'),
  method: z.enum(['card', 'bank']),
  savedCardId: z.string().min(1).optional(),
  bank: z
    .object({
      holderName: z.string().min(2).max(100),
      bankCode: z.string().regex(/^\d{1,3}$/),
      branchCode: z.string().regex(/^\d{1,4}$/),
      accountNumber: z.string().regex(/^\d{4,12}$/),
    })
    .optional(),
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

  // There is deliberately no deposit route: the wallet is credited only by a
  // provider-confirmed payment (see modules/payments).

  app.post('/wallet/withdrawals', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = withdrawalSchema.parse(request.body);
    const result = await createWithdrawal(request.user.sub, body);
    return reply.status(201).send(result);
  });

  app.get('/wallet/withdrawals', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send(await listUserWithdrawals(request.user.sub));
  });

  app.post('/wallet/withdrawals/:id/cancel', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await cancelWithdrawal(request.user.sub, id));
  });

  app.get('/wallet/transactions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { page, limit } = paginationSchema.parse(request.query);
    const result = await walletService.getTransactions(request.user.sub, page, limit);
    return reply.send(result);
  });
}
