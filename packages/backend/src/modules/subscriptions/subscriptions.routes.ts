import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createSubscription, listSubscriptions, cancelSubscription } from './subscriptions.service.js';

const createSchema = z.object({
  gameType: z.enum(['lotto', 'chance', 'seven77', 'one23']),
  numbers: z.array(z.number().int().positive()).min(1).max(10),
  strongNumber: z.number().int().positive().optional(),
  drawDays: z.array(z.enum(['tue', 'thu', 'sat'])).min(1),
});

export default async function subscriptionsRoutes(app: FastifyInstance) {
  app.post('/subscriptions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const result = await createSubscription({ userId: request.user.sub, ...body });
    return reply.status(201).send(result);
  });

  app.get('/subscriptions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const result = await listSubscriptions(request.user.sub);
    return reply.send(result);
  });

  app.delete('/subscriptions/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await cancelSubscription(id, request.user.sub);
    return reply.status(204).send();
  });
}
