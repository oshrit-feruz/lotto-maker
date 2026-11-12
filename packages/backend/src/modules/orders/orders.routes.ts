import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createOrder, getOrders, getOrderById, getOrderScanUrl } from './orders.service.js';
import { ticketBodySchema } from '../tickets/tickets.service.js';
import { assertGameEnabled } from '../../lib/games.js';

// Lotto only. Chance / 777 / 123 keep their code but new orders are blocked (403 GAME_NOT_AVAILABLE).
const createOrderSchema = z.object({
  gameType: z.enum(['lotto', 'chance', 'seven77', 'one23']).default('lotto'),
  ticket: ticketBodySchema,
  type: z.enum(['one_time', 'subscription']).default('one_time'),
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
    assertGameEnabled(body.gameType);
    const result = await createOrder({
      userId: request.user.sub,
      ticket: body.ticket,
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

  // Short-lived signed URL for the ticket scan. Never cache it.
  app.get('/orders/:id/scan', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await getOrderScanUrl(id, request.user.sub);
    return reply.header('Cache-Control', 'no-store').send(result);
  });
}
