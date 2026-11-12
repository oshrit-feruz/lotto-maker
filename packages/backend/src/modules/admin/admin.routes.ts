import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  confirmDraw,
  editDrawResults,
  editResultsSchema,
  getDraw,
  listDraws,
  listPrizeClaims,
  markClaimCollected,
} from './admin.service.js';

const listQuerySchema = z.object({
  status: z.enum(['scheduled', 'results_suggested', 'results_confirmed', 'settled']).optional(),
});
const claimsQuerySchema = z.object({ status: z.enum(['awaiting_pickup', 'collected']).optional() });

export default async function adminRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticateAdmin] };

  app.get('/admin/draws', pre, async (request, reply) => {
    const { status } = listQuerySchema.parse(request.query);
    return reply.send(await listDraws(status));
  });

  // The draw with its suggested results and prize tables
  app.get('/admin/draws/:id', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getDraw(id));
  });

  app.put('/admin/draws/:id/results', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = editResultsSchema.parse(request.body);
    return reply.send(await editDrawResults(id, request.user.sub, body));
  });

  app.post('/admin/draws/:id/confirm', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await confirmDraw(id, request.user.sub));
  });

  app.get('/admin/prize-claims', pre, async (request, reply) => {
    const { status } = claimsQuerySchema.parse(request.query);
    return reply.send(await listPrizeClaims(status));
  });

  app.post('/admin/prize-claims/:id/collected', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await markClaimCollected(id, request.user.sub));
  });
}
