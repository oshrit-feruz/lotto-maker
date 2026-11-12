import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { liftPermanentExclusion } from '../limits/limits.service.js';
import { reviewReasonSchema } from './review-reason.js';

const liftSchema = z.object({ reason: reviewReasonSchema });

export default async function adminLimitsRoutes(app: FastifyInstance) {
  // Only a permanent exclusion older than 6 months; audited with the reason
  app.post('/admin/users/:userId/lift-self-exclusion', { preHandler: [app.authenticateAdmin] }, async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const { reason } = liftSchema.parse(request.body);
    return reply.send(await liftPermanentExclusion(userId, request.user.sub, reason));
  });
}
