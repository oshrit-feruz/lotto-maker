import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { approveKyc, listKycChecks, rejectKyc } from '../kyc/kyc.service.js';

const listQuerySchema = z.object({ status: z.enum(['verified', 'rejected', 'manual_review']).optional() });
const rejectSchema = z.object({ reason: z.string().min(2).max(500) });

/** Admin queue for identity checks the provider could not decide (all calls are audited). */
export default async function adminKycRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticateAdmin] };

  app.get('/admin/kyc', pre, async (request, reply) => {
    const { status } = listQuerySchema.parse(request.query);
    return reply.send(await listKycChecks(request.user.sub, status));
  });

  app.post('/admin/kyc/:id/approve', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await approveKyc(id, request.user.sub));
  });

  app.post('/admin/kyc/:id/reject', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = rejectSchema.parse(request.body);
    return reply.send(await rejectKyc(id, request.user.sub, reason));
  });
}
