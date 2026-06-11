import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOrder, getOrders, getOrderById } from './orders.service.js';

const createOrderSchema = z.object({
  gameType: z.enum(['lotto', 'chance', 'seven77', 'one23']),
  numbers: z.array(z.number().int().positive()).min(1).max(10),
  strongNumber: z.number().int().positive().optional(),
  type: z.enum(['one_time', 'subscription']),
  subscriptionId: z.string().optional(),
});

const listOrdersSchema = z.object({
  status: z.enum(['pending', 'in_queue', 'keyed', 'scanned', 'won', 'lost', 'refunded']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export default async function ordersRoutes(app: FastifyInstance) {
  app.post('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createOrderSchema.parse(request.body);
    const result = await createOrder({
      userId: request.user.sub,
      gameType: body.gameType,
      numbers: body.numbers,
      strongNumber: body.strongNumber,
      type: body.type,
      subscriptionId: body.subscriptionId,
    });
    return reply.status(201).send(result);
  });

  app.get('/orders', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { status, page, limit } = listOrdersSchema.parse(request.query);
    const result = await getOrders(request.user.sub, { status, page, limit });
    return reply.send(result);
  });

  app.get('/orders/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await getOrderById(id, request.user.sub);
    return reply.send(order);
  });
}
