import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  confirmDraw,
  DRAWS_MAX_PAGE_SIZE,
  editDrawResults,
  editResultsSchema,
  getDraw,
  listDraws,
} from './admin.service.js';

const listQuerySchema = z.object({
  status: z.enum(['scheduled', 'results_suggested', 'results_confirmed', 'settled']).optional(),
  // Optional: with either one the response is { items, total, page, pageSize }, else the old array
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(DRAWS_MAX_PAGE_SIZE).optional(),
});

const confirmSchema = z.object({
  // The draw's updatedAt from the GET the admin reviewed. Mismatch: 409 RESULTS_CHANGED.
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
});

export default async function adminRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticateAdmin] };

  app.get('/admin/draws', pre, async (request, reply) => {
    const { status, page, pageSize } = listQuerySchema.parse(request.query);
    return reply.send(await listDraws(status, { page, pageSize }));
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
    const { expectedUpdatedAt } = confirmSchema.parse(request.body ?? {});
    return reply.send(
      await confirmDraw(id, request.user.sub, expectedUpdatedAt ? new Date(expectedUpdatedAt) : undefined),
    );
  });

  // Prize claims (list, schedule, collect) are in admin-money.routes.ts
}
