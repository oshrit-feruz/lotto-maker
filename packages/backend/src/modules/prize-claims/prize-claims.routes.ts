import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listUserClaims, scheduleClaimAsUser } from './prize-claims.service.js';

export const scheduleSchema = z.object({
  // ISO 8601 with an offset, e.g. 2026-12-01T09:30:00+02:00
  scheduledAt: z.string().datetime({ offset: true }),
});

export default async function prizeClaimsRoutes(app: FastifyInstance) {
  app.get('/me/prize-claims', { preHandler: [app.authenticate] }, async (request, reply) => {
    return reply.send(await listUserClaims(request.user.sub));
  });

  app.post('/me/prize-claims/:id/schedule', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { scheduledAt } = scheduleSchema.parse(request.body);
    return reply.send(await scheduleClaimAsUser(request.user.sub, id, new Date(scheduledAt)));
  });
}
