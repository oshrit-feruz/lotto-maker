import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  approveWithdrawal,
  getBankDetails,
  listWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
} from '../wallet/withdrawals.service.js';
import { listCardCredits, markCardCreditPaid } from '../wallet/card-credits.service.js';

const withdrawalsQuerySchema = z.object({
  status: z.enum(['requested', 'approved', 'rejected', 'paid', 'failed', 'cancelled']).optional(),
});
const rejectSchema = z.object({ reason: z.string().min(2).max(500) });
const cardCreditsQuerySchema = z.object({ status: z.enum(['pending', 'paid', 'failed']).optional() });
const cardCreditMarkPaidSchema = z.object({ reference: z.string().min(1).max(100) });
const markPaidSchema = z.object({ bankReference: z.string().min(1).max(100) });

/** Admin endpoints for money going out: withdrawals, card credits and prize claims. */
export default async function adminMoneyRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticateAdmin] };

  app.get('/admin/withdrawals', pre, async (request, reply) => {
    const { status } = withdrawalsQuerySchema.parse(request.query);
    return reply.send(await listWithdrawals(status));
  });

  // Decrypted bank details, for making the transfer. Audited.
  app.get('/admin/withdrawals/:id/bank-details', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getBankDetails(id, request.user.sub));
  });

  app.post('/admin/withdrawals/:id/approve', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await approveWithdrawal(id, { id: request.user.sub, type: 'admin' }));
  });

  app.post('/admin/withdrawals/:id/reject', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = rejectSchema.parse(request.body);
    return reply.send(await rejectWithdrawal(id, request.user.sub, reason));
  });

  // Prize money above the wallet cap that could not be paid to a card yet
  app.get('/admin/card-credits', pre, async (request, reply) => {
    const { status } = cardCreditsQuerySchema.parse(request.query);
    return reply.send(await listCardCredits(status));
  });

  app.post('/admin/card-credits/:id/mark-paid', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reference } = cardCreditMarkPaidSchema.parse(request.body);
    return reply.send(await markCardCreditPaid(id, request.user.sub, reference));
  });

  app.post('/admin/withdrawals/:id/mark-paid', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { bankReference } = markPaidSchema.parse(request.body);
    return reply.send(await markWithdrawalPaid(id, request.user.sub, bankReference));
  });
}
