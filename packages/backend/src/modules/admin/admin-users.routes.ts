import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AUDIT_DEFAULT_PAGE_SIZE,
  AUDIT_MAX_PAGE_SIZE,
  getUserForAdmin,
  listAuditLog,
  searchUsersByPhone,
  setUserStatus,
} from './admin-users.service.js';

const searchSchema = z.object({ phone: z.string().min(1).max(30) });
// The reason goes into the audit entry. Optional because the admin dashboard does not send one yet.
const statusChangeSchema = z.object({ reason: z.string().trim().min(2).max(500).optional() });
const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/, 'Use an ISO date (YYYY-MM-DD) or date-time with offset')
  .optional();
const auditQuerySchema = z.object({
  action: z.string().min(1).max(100).optional(),
  from: dateParam,
  to: dateParam,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(AUDIT_MAX_PAGE_SIZE).default(AUDIT_DEFAULT_PAGE_SIZE),
});

/** Admin: customer lookup, suspension, and the audit log. */
export default async function adminUsersRoutes(app: FastifyInstance) {
  const pre = { preHandler: [app.authenticateAdmin] };

  app.get('/admin/users', pre, async (request, reply) => {
    const { phone } = searchSchema.parse(request.query);
    return reply.send(await searchUsersByPhone(phone));
  });

  app.get('/admin/users/:id', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await getUserForAdmin(id));
  });

  app.post('/admin/users/:id/suspend', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = statusChangeSchema.parse(request.body ?? {});
    return reply.send(await setUserStatus(id, request.user.sub, 'suspended', reason));
  });

  app.post('/admin/users/:id/unsuspend', pre, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = statusChangeSchema.parse(request.body ?? {});
    return reply.send(await setUserStatus(id, request.user.sub, 'active', reason));
  });

  app.get('/admin/audit', pre, async (request, reply) => {
    return reply.send(await listAuditLog(auditQuerySchema.parse(request.query)));
  });
}
