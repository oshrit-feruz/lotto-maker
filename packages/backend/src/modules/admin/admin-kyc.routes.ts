import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  approveKyc,
  KYC_LIST_DEFAULT_PAGE_SIZE,
  KYC_LIST_MAX_PAGE_SIZE,
  listKycChecks,
  rejectKyc,
} from '../kyc/kyc.service.js';
import { reviewReasonSchema } from './review-reason.js';

const listQuerySchema = z.object({
  status: z.enum(['verified', 'rejected', 'manual_review']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(KYC_LIST_MAX_PAGE_SIZE).default(KYC_LIST_DEFAULT_PAGE_SIZE),
});
const rejectSchema = z.object({ reason: reviewReasonSchema });

/** Admin queue for identity checks the provider could not decide (all calls are audited). */
export default async function adminKycRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticateAdmin] };

  // { items, total, page, pageSize }
  app.get('/admin/kyc', pre, async (request, reply) => {
    const query = listQuerySchema.parse(request.query);
    return reply.send(await listKycChecks(request.user.sub, query));
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
